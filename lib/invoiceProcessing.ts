/**
 * Invoice Intelligence Layer - Core Processing
 * 
 * This module implements ALL backend logic for invoice processing:
 * 1. Date normalization (BS ↔ AD conversion)
 * 2. VAT validation
 * 3. Field validation
 * 4. Auto-merge logic
 * 5. Flag computation
 * 
 * CRITICAL: All logic is deterministic - NO AI inference in this layer.
 */

import {
    convertFromBS,
    convertFromAD,
    detectCalendar,
    parseBSDate,
    parseADDate,
    formatBSDate,
    formatADDate
} from './nepaliCalendar';

import {
    GeminiExtractionResponse,
    NormalizedDate,
    ProcessedInvoiceData,
    InvoiceValidationFlags,
    InvoiceProcessingResult,
    MergeCandidate
} from './invoiceTypes';

import { convertNepaliDigits, normalizeString } from './normalization';

// -------------------------------------------------------------------
// DATE NORMALIZATION
// -------------------------------------------------------------------

/**
 * Normalize a date from Gemini extraction
 * 
 * Rules:
 * - If calendar detected as BS → convert to AD
 * - If calendar detected as AD → convert to BS
 * - Both calendars must be stored
 * - Returns null if conversion fails
 */
export function normalizeDateField(
    rawText: string | null,
    calendarDetected: 'BS' | 'AD' | null
): NormalizedDate | null {
    if (!rawText) return null;

    // Normalize the raw text (Nepali digits → Arabic)
    const normalized = convertNepaliDigits(rawText) || rawText;

    // Auto-detect calendar if not provided
    const calendar = calendarDetected || detectCalendar(normalized);
    if (!calendar) {
        // Cannot determine calendar - try both
        const bsAttempt = convertFromBS(normalized);
        if (bsAttempt) {
            return {
                raw_text: rawText,
                calendar_detected: 'BS',
                bs_date: bsAttempt.bsFormatted,
                ad_date: bsAttempt.adFormatted,
                conversion_valid: true
            };
        }

        const adAttempt = convertFromAD(normalized);
        if (adAttempt) {
            return {
                raw_text: rawText,
                calendar_detected: 'AD',
                bs_date: adAttempt.bsFormatted,
                ad_date: adAttempt.adFormatted,
                conversion_valid: true
            };
        }

        // Both failed
        return {
            raw_text: rawText,
            calendar_detected: 'BS', // Default assumption for Nepal
            bs_date: '',
            ad_date: '',
            conversion_valid: false
        };
    }

    // Convert based on detected calendar
    if (calendar === 'BS') {
        const converted = convertFromBS(normalized);
        if (!converted) {
            return {
                raw_text: rawText,
                calendar_detected: 'BS',
                bs_date: normalized,
                ad_date: '',
                conversion_valid: false
            };
        }
        return {
            raw_text: rawText,
            calendar_detected: 'BS',
            bs_date: converted.bsFormatted,
            ad_date: converted.adFormatted,
            conversion_valid: true
        };
    } else {
        const converted = convertFromAD(normalized);
        if (!converted) {
            return {
                raw_text: rawText,
                calendar_detected: 'AD',
                bs_date: '',
                ad_date: normalized,
                conversion_valid: false
            };
        }
        return {
            raw_text: rawText,
            calendar_detected: 'AD',
            bs_date: converted.bsFormatted,
            ad_date: converted.adFormatted,
            conversion_valid: true
        };
    }
}

/**
 * Determine the PRIMARY date for ledger sorting and merge key
 * 
 * Priority:
 * 1. Transaction Date in BS
 * 2. Bill Issuing Date in BS (if Transaction Date missing)
 */
export function determinePrimaryDate(
    transactionDate: NormalizedDate | null,
    billIssuingDate: NormalizedDate | null
): { date: NormalizedDate | null; source: 'transaction' | 'bill_issuing' | null } {
    // Prefer transaction date
    if (transactionDate && transactionDate.conversion_valid) {
        return { date: transactionDate, source: 'transaction' };
    }

    // Fall back to bill issuing date
    if (billIssuingDate && billIssuingDate.conversion_valid) {
        return { date: billIssuingDate, source: 'bill_issuing' };
    }

    // No valid date
    return { date: null, source: null };
}

// -------------------------------------------------------------------
// PAN VALIDATION
// -------------------------------------------------------------------

/**
 * Validate Nepal PAN (Permanent Account Number)
 * 
 * Rules:
 * - Must be 9 digits
 * - All numeric
 */
export function validatePAN(pan: string | null): boolean {
    if (!pan) return false;
    const cleaned = convertNepaliDigits(pan)?.replace(/\D/g, '') || '';
    return cleaned.length === 9;
}

// -------------------------------------------------------------------
// VAT VALIDATION
// -------------------------------------------------------------------

/**
 * Infer VAT rate from amounts if not explicitly provided
 * 
 * Rules:
 * - If vat_amount > 0 and taxable > 0, calculate implied rate
 * - If implied rate ≈ 13% (within tolerance), return 13
 * - If vat_amount = 0 or missing, return 0
 */
export function inferVATRate(
    vatAmount: number | null,
    taxableAmount: number | null,
    explicitRate: number | null
): number {
    // If explicit rate provided, use it
    if (explicitRate !== null && (explicitRate === 0 || explicitRate === 13)) {
        return explicitRate;
    }

    // No VAT case
    if (!vatAmount || vatAmount === 0) {
        return 0;
    }

    // Calculate implied rate
    if (taxableAmount && taxableAmount > 0) {
        const impliedRate = (vatAmount / taxableAmount) * 100;
        // Check if close to 13%
        if (Math.abs(impliedRate - 13) <= 1) {
            return 13;
        }
    }

    // Default to 13% if VAT exists
    return 13;
}

/**
 * Validate VAT calculations
 * 
 * Rules:
 * - math_mismatch: taxable + vat ≠ total (±2 NPR tolerance)
 * - vat_inconsistent: vat ≠ taxable × rate (±2 NPR tolerance)
 */
export function validateVAT(
    taxableAmount: number | null,
    vatAmount: number | null,
    grandTotal: number | null,
    vatRate: number
): { math_mismatch: boolean; vat_inconsistent: boolean; notes: string[] } {
    const notes: string[] = [];
    let math_mismatch = false;
    let vat_inconsistent = false;

    const taxable = taxableAmount || 0;
    const vat = vatAmount || 0;
    const total = grandTotal || 0;

    // Math check: taxable + vat = total
    const expectedTotal = taxable + vat;
    if (Math.abs(expectedTotal - total) > 2) {
        math_mismatch = true;
        notes.push(`Math mismatch: ${taxable} + ${vat} = ${expectedTotal}, but total is ${total}`);
    }

    // VAT consistency check (only if VAT should be present)
    if (vatRate > 0 && taxable > 0) {
        const expectedVat = taxable * (vatRate / 100);
        if (Math.abs(expectedVat - vat) > 2) {
            vat_inconsistent = true;
            notes.push(`VAT inconsistent: ${vatRate}% of ${taxable} = ${expectedVat.toFixed(2)}, but VAT is ${vat}`);
        }
    }

    return { math_mismatch, vat_inconsistent, notes };
}

// -------------------------------------------------------------------
// MERGE KEY GENERATION
// -------------------------------------------------------------------

/**
 * Generate canonical merge key for auto-merge detection
 * 
 * Format: workspace_id|vendor_normalized|invoice_num|primary_bs_date
 * 
 * Rules:
 * - All fields must be present
 * - Vendor name normalized to lowercase, trimmed
 * - Invoice number normalized (Nepali → Arabic, alphanumeric only)
 * - Date in BS format
 */
export function generateMergeKey(
    workspaceId: string,
    vendorNameEn: string | null,
    invoiceNumberEn: string | null,
    primaryBsDate: string | null
): string | null {
    // ALL fields required for merge key
    if (!workspaceId || !vendorNameEn || !invoiceNumberEn || !primaryBsDate) {
        return null;
    }

    const vendorNormalized = normalizeString(vendorNameEn)?.toLowerCase().trim() || '';
    const invoiceNormalized = convertNepaliDigits(invoiceNumberEn)
        ?.replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase() || '';

    if (!vendorNormalized || !invoiceNormalized) {
        return null;
    }

    return `${workspaceId}|${vendorNormalized}|${invoiceNormalized}|${primaryBsDate}`;
}

// -------------------------------------------------------------------
// FIELD VALIDATION
// -------------------------------------------------------------------

/**
 * Check if invoice has all required fields for approval
 * 
 * Required:
 * - vendor_name_en
 * - invoice_number_en
 * - primary date (transaction or bill issuing)
 * - grand_total
 */
export function checkRequiredFields(data: ProcessedInvoiceData): {
    missing_fields: boolean;
    missing: string[];
} {
    const missing: string[] = [];

    if (!data.vendor_name_en) missing.push('vendor_name_en');
    if (!data.invoice_number_en) missing.push('invoice_number_en');
    if (!data.primary_date) missing.push('primary_date');
    if (data.grand_total === null || data.grand_total === undefined) {
        missing.push('grand_total');
    }

    return {
        missing_fields: missing.length > 0,
        missing
    };
}

// -------------------------------------------------------------------
// COMPLETE PROCESSING PIPELINE
// -------------------------------------------------------------------

/**
 * Process Gemini extraction into normalized invoice data
 * 
 * This is the MAIN entry point for invoice intelligence.
 */
export function processGeminiExtraction(
    extraction: GeminiExtractionResponse,
    workspaceId: string
): InvoiceProcessingResult {
    const notes: string[] = [];

    // -------------------------------------------------------------------
    // 1. NORMALIZE DATES
    // -------------------------------------------------------------------

    const transactionDate = normalizeDateField(
        extraction.transaction_date_raw,
        extraction.transaction_date_calendar
    );

    const billIssuingDate = normalizeDateField(
        extraction.bill_issuing_date_raw,
        extraction.bill_issuing_date_calendar
    );

    const { date: primaryDate, source: primaryDateSource } = determinePrimaryDate(
        transactionDate,
        billIssuingDate
    );

    // Check for date conversion failures
    let date_conversion_failed = false;
    if (extraction.transaction_date_raw && (!transactionDate || !transactionDate.conversion_valid)) {
        date_conversion_failed = true;
        notes.push('Transaction date conversion failed');
    }
    if (extraction.bill_issuing_date_raw && (!billIssuingDate || !billIssuingDate.conversion_valid)) {
        date_conversion_failed = true;
        notes.push('Bill issuing date conversion failed');
    }

    // -------------------------------------------------------------------
    // 2. NORMALIZE VENDOR & INVOICE NUMBER
    // -------------------------------------------------------------------

    const vendorNameEn = normalizeString(extraction.vendor_name_en);
    const invoiceNumberEn = convertNepaliDigits(
        normalizeString(extraction.invoice_number_en)
    );

    // -------------------------------------------------------------------
    // 3. VALIDATE PAN
    // -------------------------------------------------------------------

    const panValid = validatePAN(extraction.seller_pan);
    if (extraction.seller_pan && !panValid) {
        notes.push(`Invalid PAN format: ${extraction.seller_pan}`);
    }

    // -------------------------------------------------------------------
    // 4. VALIDATE VAT
    // -------------------------------------------------------------------

    const vatRate = inferVATRate(
        extraction.vat_amount,
        extraction.taxable_amount,
        extraction.vat_rate
    );

    const isVatInvoice = vatRate > 0;

    const vatValidation = validateVAT(
        extraction.taxable_amount,
        extraction.vat_amount,
        extraction.grand_total,
        vatRate
    );

    notes.push(...vatValidation.notes);

    // -------------------------------------------------------------------
    // 5. BUILD PROCESSED DATA
    // -------------------------------------------------------------------

    const primaryBsDate = primaryDate?.bs_date || null;
    const mergeKey = generateMergeKey(
        workspaceId,
        vendorNameEn,
        invoiceNumberEn,
        primaryBsDate
    );

    const data: ProcessedInvoiceData = {
        vendor_name_raw: extraction.vendor_name_raw,
        vendor_name_en: vendorNameEn,
        seller_pan: extraction.seller_pan,
        pan_valid: panValid,

        invoice_number_raw: extraction.invoice_number_raw,
        invoice_number_en: invoiceNumberEn,

        transaction_date: transactionDate,
        bill_issuing_date: billIssuingDate,
        primary_date: primaryDate,
        primary_date_source: primaryDateSource,

        taxable_amount: extraction.taxable_amount,
        vat_amount: extraction.vat_amount,
        vat_rate: vatRate,
        grand_total: extraction.grand_total,
        currency: 'NPR',

        is_vat_invoice: isVatInvoice,
        merge_key: mergeKey
    };

    // -------------------------------------------------------------------
    // 6. CHECK REQUIRED FIELDS
    // -------------------------------------------------------------------

    const { missing_fields, missing } = checkRequiredFields(data);
    if (missing_fields) {
        notes.push(`Missing required fields: ${missing.join(', ')}`);
    }

    // -------------------------------------------------------------------
    // 7. BUILD FLAGS
    // -------------------------------------------------------------------

    const flags: InvoiceValidationFlags = {
        missing_fields,
        math_mismatch: vatValidation.math_mismatch,
        vat_inconsistent: vatValidation.vat_inconsistent,
        date_conversion_failed,
        date_mismatch: false, // TODO: implement if both BS/AD provided
        duplicate_invoice: false, // Set by merge check later
        pan_invalid: !panValid && !!extraction.seller_pan,
        notes
    };

    // -------------------------------------------------------------------
    // 8. DETERMINE APPROVAL ELIGIBILITY
    // -------------------------------------------------------------------

    const canApprove = !missing_fields &&
        !vatValidation.math_mismatch &&
        !date_conversion_failed;

    return {
        success: true,
        data,
        flags,
        merge_candidate: null, // Set by merge check
        can_approve: canApprove
    };
}

// -------------------------------------------------------------------
// AUTO-MERGE DETECTION
// -------------------------------------------------------------------

/**
 * Check if invoice should be merged with existing invoice
 * 
 * Rules:
 * - Same merge key = same invoice
 * - If merge candidate found, return existing invoice ID
 */
export async function checkForMergeCandidate(
    mergeKey: string | null,
    currentInvoiceId: string,
    supabase: any // Supabase client
): Promise<MergeCandidate | null> {
    if (!mergeKey) return null;

    const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('merge_key', mergeKey)
        .neq('id', currentInvoiceId)
        .limit(1);

    if (existing && existing.length > 0) {
        return {
            existing_invoice_id: existing[0].id,
            merge_key: mergeKey,
            confidence: 'exact'
        };
    }

    return null;
}

/**
 * Execute auto-merge: move pages from duplicate to existing invoice
 * 
 * Rules:
 * - Move all pages from duplicate to existing
 * - Increment page numbers appropriately
 * - Delete duplicate invoice record
 * - Do NOT re-run extraction (preserve existing confirmed data)
 */
export async function executeAutoMerge(
    existingInvoiceId: string,
    duplicateInvoiceId: string,
    supabase: any
): Promise<boolean> {
    try {
        // Get max page number of existing invoice
        const { data: existingPages } = await supabase
            .from('invoice_pages')
            .select('page_no')
            .eq('invoice_id', existingInvoiceId)
            .order('page_no', { ascending: false })
            .limit(1);

        const maxPageNo = existingPages?.[0]?.page_no || 0;

        // Get pages from duplicate invoice
        const { data: duplicatePages } = await supabase
            .from('invoice_pages')
            .select('id, page_no')
            .eq('invoice_id', duplicateInvoiceId)
            .order('page_no', { ascending: true });

        if (!duplicatePages || duplicatePages.length === 0) {
            return false;
        }

        // Move pages to existing invoice with new page numbers
        for (let i = 0; i < duplicatePages.length; i++) {
            await supabase
                .from('invoice_pages')
                .update({
                    invoice_id: existingInvoiceId,
                    page_no: maxPageNo + i + 1
                })
                .eq('id', duplicatePages[i].id);
        }

        // Delete duplicate invoice (cascades to related records)
        await supabase
            .from('invoices')
            .delete()
            .eq('id', duplicateInvoiceId);

        return true;

    } catch (e) {
        console.error('Auto-merge failed:', e);
        return false;
    }
}
