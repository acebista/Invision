/**
 * Invoice Intelligence Layer - Core Types
 * 
 * Defines the complete data model for Nepalese invoice processing.
 */

// -------------------------------------------------------------------
// GEMINI EXTRACTION RESPONSE
// -------------------------------------------------------------------

/**
 * Raw extraction result from Gemini 1.5 Flash Vision
 * This is the EXACT schema Gemini must return
 */
export interface GeminiExtractionResponse {
    // Vendor Information
    vendor_name_raw: string | null;      // Exact text as written (may be Nepali)
    vendor_name_en: string | null;       // Transliterated to Roman script
    seller_pan: string | null;           // PAN/VAT number

    // Invoice Number
    invoice_number_raw: string | null;   // Exact text as written
    invoice_number_en: string | null;    // Normalized to Arabic numerals

    // Transaction Date (कारोबार मिति)
    transaction_date_raw: string | null;         // Exact text as written
    transaction_date_calendar: 'BS' | 'AD' | null; // Detected calendar type

    // Bill Issuing Date (बिजक जारी मिति)
    bill_issuing_date_raw: string | null;        // Exact text as written
    bill_issuing_date_calendar: 'BS' | 'AD' | null;

    // Amounts
    taxable_amount: number | null;
    vat_amount: number | null;
    vat_rate: number | null;            // 13 or 0
    grand_total: number | null;
    currency: 'NPR';
}

// -------------------------------------------------------------------
// NORMALIZED DATE MODEL
// -------------------------------------------------------------------

/**
 * Fully normalized date with both calendar systems
 */
export interface NormalizedDate {
    raw_text: string;                   // Exact text from invoice
    calendar_detected: 'BS' | 'AD';     // Which calendar was on invoice
    bs_date: string;                    // Nepali date (YYYY/MM/DD)
    ad_date: string;                    // Gregorian ISO (YYYY-MM-DD)
    conversion_valid: boolean;          // Whether conversion succeeded
}

// -------------------------------------------------------------------
// PROCESSED INVOICE DATA
// -------------------------------------------------------------------

/**
 * Complete normalized invoice data after backend processing
 */
export interface ProcessedInvoiceData {
    // Vendor
    vendor_name_raw: string | null;
    vendor_name_en: string | null;
    seller_pan: string | null;
    pan_valid: boolean;

    // Invoice Number
    invoice_number_raw: string | null;
    invoice_number_en: string | null;

    // Dates
    transaction_date: NormalizedDate | null;
    bill_issuing_date: NormalizedDate | null;
    primary_date: NormalizedDate | null;         // For sorting/merge
    primary_date_source: 'transaction' | 'bill_issuing' | null;

    // Amounts
    taxable_amount: number | null;
    vat_amount: number | null;
    vat_rate: number | null;
    grand_total: number | null;
    currency: 'NPR';

    // Computed
    is_vat_invoice: boolean;
    merge_key: string | null;
}

// -------------------------------------------------------------------
// VALIDATION FLAGS
// -------------------------------------------------------------------

/**
 * Validation flags for invoice review
 */
export interface InvoiceValidationFlags {
    // Critical flags (block approval)
    missing_fields: boolean;            // Required fields missing

    // Math flags
    math_mismatch: boolean;             // taxable + vat ≠ total
    vat_inconsistent: boolean;          // vat ≠ taxable × rate

    // Date flags
    date_conversion_failed: boolean;    // BS↔AD conversion failed
    date_mismatch: boolean;             // If both BS/AD present but don't match

    // Duplicate flag
    duplicate_invoice: boolean;         // Merge key exists

    // Soft warnings
    pan_invalid: boolean;               // PAN format invalid

    // Notes
    notes: string[];
}

// -------------------------------------------------------------------
// MERGE CANDIDATE
// -------------------------------------------------------------------

export interface MergeCandidate {
    existing_invoice_id: string;
    merge_key: string;
    confidence: 'exact' | 'fuzzy';
}

// -------------------------------------------------------------------
// PROCESSING RESULT
// -------------------------------------------------------------------

export interface InvoiceProcessingResult {
    success: boolean;
    data: ProcessedInvoiceData;
    flags: InvoiceValidationFlags;
    merge_candidate: MergeCandidate | null;
    can_approve: boolean;
}
