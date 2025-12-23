/**
 * Normalization Utilities for Nepalese Invoice Processing
 * 
 * This module handles:
 * 1. Nepali digit conversion (०-९ → 0-9)
 * 2. String normalization
 * 3. Amount parsing
 * 4. Merge key generation
 * 5. PAN/VAT number normalization
 */

// -------------------------------------------------------------------
// NEPALI DIGIT CONVERSION
// -------------------------------------------------------------------

/**
 * Convert Nepali (Devanagari) digits to Arabic numerals
 * 
 * ० → 0, १ → 1, २ → 2, ... ९ → 9
 */
export function convertNepaliDigits(input: string | null | undefined): string | null {
    if (!input) return null;

    const mapping: { [key: string]: string } = {
        '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
        '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
    };

    return input.split('').map(char => mapping[char] || char).join('');
}

/**
 * Convert Arabic numerals to Nepali digits (for display)
 */
export function convertToNepaliDigits(input: string | null | undefined): string | null {
    if (!input) return null;

    const mapping: { [key: string]: string } = {
        '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
        '5': '५', '6': '६', '7': '७', '8': '८', '9': '९'
    };

    return input.split('').map(char => mapping[char] || char).join('');
}

// -------------------------------------------------------------------
// STRING NORMALIZATION
// -------------------------------------------------------------------

/**
 * Normalize string for consistent comparison
 * - Trims whitespace
 * - Collapses multiple spaces into one
 * - Removes control characters
 */
export function normalizeString(input: string | null | undefined): string | null {
    if (!input) return null;

    return input
        .trim()
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
        .replace(/\s+/g, ' ');           // Collapse whitespace
}

/**
 * Normalize vendor name for comparison
 * - Lowercase
 * - Remove common suffixes (Pvt Ltd, Private Limited, etc.)
 * - Normalize string
 */
export function normalizeVendorName(input: string | null | undefined): string | null {
    if (!input) return null;

    let normalized = normalizeString(input);
    if (!normalized) return null;

    normalized = normalized.toLowerCase();

    // Remove common business suffixes
    const suffixes = [
        'pvt ltd', 'pvt. ltd.', 'pvt. ltd', 'private limited',
        'p ltd', 'p. ltd.', 'limited', 'ltd', 'ltd.',
        '(p) ltd', '(pvt) ltd', 'प्रा लि', 'प्रा. लि.'
    ];

    for (const suffix of suffixes) {
        if (normalized.endsWith(suffix)) {
            normalized = normalized.slice(0, -suffix.length).trim();
        }
    }

    return normalized;
}

// -------------------------------------------------------------------
// AMOUNT PARSING
// -------------------------------------------------------------------

/**
 * Parse amount from string, handling:
 * - Nepali digits
 * - Commas as thousand separators
 * - Various decimal formats
 */
export function parseAmount(input: string | null | undefined): number | null {
    if (!input) return null;

    // Convert Nepali digits first
    let str = convertNepaliDigits(input.toString()) || '';

    // Remove currency symbols and spaces
    str = str.replace(/[₨Rs\s,]/gi, '');

    // Handle Nepali-style numbers (lakh/crore separators)
    str = str.replace(/,/g, '');

    const num = parseFloat(str);
    return isNaN(num) ? null : num;
}

/**
 * Format amount for display in Nepali style
 * E.g., 1234567 → 12,34,567
 */
export function formatNepaliAmount(amount: number | null): string {
    if (amount === null || amount === undefined) return '';

    const parts = amount.toFixed(2).split('.');
    const intPart = parts[0];
    const decPart = parts[1];

    // Nepali grouping: first 3, then 2s
    let result = '';
    const digits = intPart.split('').reverse();

    for (let i = 0; i < digits.length; i++) {
        if (i === 3 || (i > 3 && (i - 3) % 2 === 0)) {
            result = ',' + result;
        }
        result = digits[i] + result;
    }

    return result + '.' + decPart;
}

// -------------------------------------------------------------------
// INVOICE NUMBER NORMALIZATION
// -------------------------------------------------------------------

/**
 * Normalize invoice number for comparison
 * - Convert Nepali digits
 * - Remove non-alphanumeric characters (except hyphens)
 * - Lowercase
 */
export function normalizeInvoiceNumber(input: string | null | undefined): string | null {
    if (!input) return null;

    let normalized = convertNepaliDigits(input);
    if (!normalized) return null;

    normalized = normalized.toLowerCase();
    normalized = normalized.replace(/[^a-z0-9\-]/g, '');

    return normalized || null;
}

// -------------------------------------------------------------------
// PAN NORMALIZATION
// -------------------------------------------------------------------

/**
 * Normalize PAN (Permanent Account Number)
 * - Extract digits only
 * - Validate 9-digit format
 */
export function normalizePAN(input: string | null | undefined): {
    normalized: string | null;
    isValid: boolean;
} {
    if (!input) return { normalized: null, isValid: false };

    // Convert Nepali digits and extract only digits
    const digits = convertNepaliDigits(input)?.replace(/\D/g, '') || '';

    return {
        normalized: digits || null,
        isValid: digits.length === 9
    };
}

// -------------------------------------------------------------------
// MERGE KEY GENERATION
// -------------------------------------------------------------------

/**
 * Generate canonical merge key for auto-merge detection
 * 
 * Format: workspace|vendor|invoice_num|bs_date
 * 
 * Rules:
 * - All components must be present
 * - Vendor normalized (lowercase, no suffix)
 * - Invoice number normalized (lowercase, alphanumeric)
 * - Date in BS format (YYYY/MM/DD)
 */
export function generateMergeKey(
    workspaceId: string,
    vendorName: string | null | undefined,
    invoiceNumber: string | null | undefined,
    bsDate: string | null | undefined
): string | null {
    // ALL fields required
    if (!workspaceId || !vendorName || !invoiceNumber || !bsDate) {
        return null;
    }

    const vendor = normalizeVendorName(vendorName);
    const invNum = normalizeInvoiceNumber(invoiceNumber);

    if (!vendor || !invNum) {
        return null;
    }

    return `${workspaceId}|${vendor}|${invNum}|${bsDate}`;
}

// -------------------------------------------------------------------
// DATE STRING NORMALIZATION
// -------------------------------------------------------------------

/**
 * Normalize date string format
 * - Convert Nepali digits
 * - Standardize separators to /
 * - Extract YYYY/MM/DD format
 */
export function normalizeDateString(input: string | null | undefined): string | null {
    if (!input) return null;

    // Convert Nepali digits
    let str = convertNepaliDigits(input);
    if (!str) return null;

    // Replace various separators with /
    str = str.replace(/[\.\-]/g, '/');

    // Try to extract date parts
    const match = str.match(/(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!match) return null;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    if (month < 1 || month > 12 || day < 1 || day > 32) {
        return null;
    }

    return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}
