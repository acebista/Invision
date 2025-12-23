/**
 * Invoice Validation Logic
 * 
 * Implements all validation rules for Nepalese VAT invoices:
 * 1. Required field validation
 * 2. Math validation (taxable + VAT = total)
 * 3. VAT consistency (VAT = taxable × rate)
 * 4. PAN validation
 * 5. Date validation
 * 
 * All validation uses ±2 NPR tolerance for rounding differences.
 */

import type { InvoiceValidationFlags, ProcessedInvoiceData } from './invoiceTypes';

// -------------------------------------------------------------------
// CONSTANTS
// -------------------------------------------------------------------

/** Tolerance for math comparisons in NPR */
export const AMOUNT_TOLERANCE = 2.0;

/** Valid VAT rates in Nepal */
export const VALID_VAT_RATES = [0, 13];

/** Required fields for invoice approval */
export const REQUIRED_FIELDS = [
    'vendor_name_en',
    'invoice_number_en',
    'primary_date',
    'grand_total'
] as const;

// -------------------------------------------------------------------
// MATH VALIDATION
// -------------------------------------------------------------------

/**
 * Validate that taxable + VAT = total
 * 
 * Returns true if mismatch detected (flag should be true)
 */
export function checkMathMismatch(
    taxableAmount: number | null,
    vatAmount: number | null,
    grandTotal: number | null,
    tolerance: number = AMOUNT_TOLERANCE
): { mismatch: boolean; note: string | null } {
    // If total is missing, can't validate
    if (grandTotal === null || grandTotal === undefined) {
        return { mismatch: false, note: null };
    }

    const taxable = taxableAmount || 0;
    const vat = vatAmount || 0;
    const expectedTotal = taxable + vat;
    const difference = Math.abs(expectedTotal - grandTotal);

    if (difference > tolerance) {
        return {
            mismatch: true,
            note: `Math mismatch: ${taxable} + ${vat} = ${expectedTotal}, but total is ${grandTotal} (diff: ${difference.toFixed(2)})`
        };
    }

    return { mismatch: false, note: null };
}

// -------------------------------------------------------------------
// VAT CONSISTENCY VALIDATION
// -------------------------------------------------------------------

/**
 * Validate that VAT = taxable × rate
 * 
 * Only checks if:
 * - VAT rate > 0
 * - Taxable amount > 0
 * - VAT amount is present
 */
export function checkVatInconsistent(
    taxableAmount: number | null,
    vatAmount: number | null,
    vatRate: number | null,
    tolerance: number = AMOUNT_TOLERANCE
): { inconsistent: boolean; note: string | null } {
    // Skip if non-VAT invoice
    if (!vatRate || vatRate === 0) {
        return { inconsistent: false, note: null };
    }

    // Skip if no taxable amount
    if (!taxableAmount || taxableAmount === 0) {
        return { inconsistent: false, note: null };
    }

    // Skip if no VAT amount to compare
    if (vatAmount === null || vatAmount === undefined) {
        return { inconsistent: false, note: null };
    }

    const expectedVat = taxableAmount * (vatRate / 100);
    const difference = Math.abs(expectedVat - vatAmount);

    if (difference > tolerance) {
        return {
            inconsistent: true,
            note: `VAT inconsistent: ${vatRate}% of ${taxableAmount} = ${expectedVat.toFixed(2)}, but VAT is ${vatAmount} (diff: ${difference.toFixed(2)})`
        };
    }

    return { inconsistent: false, note: null };
}

// -------------------------------------------------------------------
// VAT RATE INFERENCE
// -------------------------------------------------------------------

/**
 * Infer VAT rate from amounts when not explicitly provided
 * 
 * Rules:
 * - If explicit rate provided and valid, use it
 * - If VAT amount = 0 or missing, rate = 0
 * - If VAT nearly 13% of taxable, rate = 13
 */
export function inferVatRate(
    taxableAmount: number | null,
    vatAmount: number | null,
    explicitRate: number | null
): number {
    // Use explicit rate if valid
    if (explicitRate !== null && VALID_VAT_RATES.includes(explicitRate)) {
        return explicitRate;
    }

    // No VAT case
    if (!vatAmount || vatAmount === 0) {
        return 0;
    }

    // Infer from amounts
    if (taxableAmount && taxableAmount > 0) {
        const impliedRate = (vatAmount / taxableAmount) * 100;

        // Check if close to 13%
        if (Math.abs(impliedRate - 13) <= 1) {
            return 13;
        }
    }

    // Default to 13 if VAT exists but can't determine rate
    return 13;
}

// -------------------------------------------------------------------
// REQUIRED FIELD VALIDATION
// -------------------------------------------------------------------

/**
 * Check if all required fields are present
 * 
 * Required for approval:
 * - vendor_name_en
 * - invoice_number_en
 * - primary_date (transaction or bill issuing)
 * - grand_total
 */
export function checkMissingFields(data: {
    vendor_name_en?: string | null;
    invoice_number_en?: string | null;
    primary_date?: any | null;
    grand_total?: number | null;
}): { missing: boolean; fields: string[] } {
    const missing: string[] = [];

    if (!data.vendor_name_en) {
        missing.push('vendor_name');
    }

    if (!data.invoice_number_en) {
        missing.push('invoice_number');
    }

    if (!data.primary_date) {
        missing.push('date');
    }

    if (data.grand_total === null || data.grand_total === undefined) {
        missing.push('grand_total');
    }

    return {
        missing: missing.length > 0,
        fields: missing
    };
}

// -------------------------------------------------------------------
// PAN VALIDATION
// -------------------------------------------------------------------

/**
 * Validate Nepal PAN (Permanent Account Number)
 * 
 * Rules:
 * - Must be exactly 9 digits
 * - No letters or special characters
 */
export function validatePAN(pan: string | null): {
    valid: boolean;
    normalized: string | null;
    note: string | null;
} {
    if (!pan) {
        return { valid: true, normalized: null, note: null }; // Optional field
    }

    // Extract digits only
    const digits = pan.replace(/\D/g, '');

    if (digits.length !== 9) {
        return {
            valid: false,
            normalized: digits || null,
            note: `Invalid PAN format: "${pan}" (expected 9 digits, got ${digits.length})`
        };
    }

    return {
        valid: true,
        normalized: digits,
        note: null
    };
}

// -------------------------------------------------------------------
// DATE VALIDATION
// -------------------------------------------------------------------

/**
 * Validate date conversion result
 */
export function validateDateConversion(
    rawDate: string | null,
    bsDate: string | null,
    adDate: string | null
): { valid: boolean; note: string | null } {
    // No date provided
    if (!rawDate) {
        return { valid: true, note: null };
    }

    // Date provided but conversion failed
    if (!bsDate || !adDate) {
        return {
            valid: false,
            note: `Date conversion failed for: "${rawDate}"`
        };
    }

    return { valid: true, note: null };
}

/**
 * Validate BS date is within reasonable range
 * Current fiscal year context: 2081-2083 BS (2024-2027 AD)
 */
export function validateDateRange(
    bsDate: string | null
): { valid: boolean; note: string | null } {
    if (!bsDate) return { valid: true, note: null };

    const match = bsDate.match(/^(\d{4})/);
    if (!match) return { valid: false, note: `Invalid date format: ${bsDate}` };

    const year = parseInt(match[1], 10);

    // Reasonable range: 2070-2095 BS (covers ~2013-2038 AD)
    if (year < 2070 || year > 2095) {
        return {
            valid: false,
            note: `Date year ${year} is outside expected range (2070-2095 BS)`
        };
    }

    return { valid: true, note: null };
}

// -------------------------------------------------------------------
// COMPLETE VALIDATION
// -------------------------------------------------------------------

/**
 * Run all validations and return complete flag set
 */
export function validateInvoice(data: {
    vendor_name_en?: string | null;
    invoice_number_en?: string | null;
    primary_date?: { bs_date?: string; ad_date?: string; conversion_valid?: boolean } | null;
    taxable_amount?: number | null;
    vat_amount?: number | null;
    vat_rate?: number | null;
    grand_total?: number | null;
    seller_pan?: string | null;
}): InvoiceValidationFlags {
    const notes: string[] = [];

    // 1. Required fields
    const { missing, fields } = checkMissingFields({
        vendor_name_en: data.vendor_name_en,
        invoice_number_en: data.invoice_number_en,
        primary_date: data.primary_date,
        grand_total: data.grand_total
    });

    if (missing) {
        notes.push(`Missing required fields: ${fields.join(', ')}`);
    }

    // 2. Math validation
    const mathResult = checkMathMismatch(
        data.taxable_amount ?? null,
        data.vat_amount ?? null,
        data.grand_total ?? null
    );
    if (mathResult.note) notes.push(mathResult.note);

    // 3. VAT consistency
    const vatResult = checkVatInconsistent(
        data.taxable_amount ?? null,
        data.vat_amount ?? null,
        data.vat_rate ?? null
    );
    if (vatResult.note) notes.push(vatResult.note);

    // 4. PAN validation
    const panResult = validatePAN(data.seller_pan ?? null);
    if (panResult.note) notes.push(panResult.note);

    // 5. Date conversion
    let dateConversionFailed = false;
    if (data.primary_date && !data.primary_date.conversion_valid) {
        dateConversionFailed = true;
        notes.push('Date conversion failed');
    }

    return {
        missing_fields: missing,
        math_mismatch: mathResult.mismatch,
        vat_inconsistent: vatResult.inconsistent,
        date_conversion_failed: dateConversionFailed,
        date_mismatch: false, // TODO: implement if both BS/AD on invoice
        duplicate_invoice: false, // Set by merge check
        pan_invalid: !panResult.valid,
        notes
    };
}

/**
 * Determine if invoice can be auto-approved
 * 
 * Criteria:
 * - No missing fields
 * - No math mismatch
 * - Date conversion succeeded
 */
export function canAutoApprove(flags: InvoiceValidationFlags): boolean {
    return !flags.missing_fields &&
        !flags.math_mismatch &&
        !flags.date_conversion_failed;
}
