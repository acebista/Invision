/**
 * Invoice Export Utilities
 * 
 * Handles ledger-sorted export of approved invoices.
 * 
 * Export Rules:
 * - Sort by PRIMARY BS date (ascending)
 * - Include BOTH BS and AD dates
 * - Numeric fields only (no commas in numbers)
 * - One row per logical invoice
 */

import { formatNepaliAmount } from './normalization';

// -------------------------------------------------------------------
// EXPORT COLUMN DEFINITIONS
// -------------------------------------------------------------------

export const EXPORT_COLUMNS = [
    { key: 'sn', label: 'S.N.' },
    { key: 'vendor_name', label: 'Vendor Name' },
    { key: 'seller_pan', label: 'PAN' },
    { key: 'invoice_number', label: 'Invoice No.' },
    { key: 'invoice_date_bs', label: 'Date (BS)' },
    { key: 'invoice_date_ad', label: 'Date (AD)' },
    { key: 'taxable_amount', label: 'Taxable Amount' },
    { key: 'vat_amount', label: 'VAT Amount' },
    { key: 'grand_total', label: 'Total' },
] as const;

// -------------------------------------------------------------------
// TYPES
// -------------------------------------------------------------------

export interface ExportableInvoice {
    id: string;
    vendor_name: string | null;
    seller_pan: string | null;
    invoice_number: string | null;
    invoice_date_bs: string | null;
    invoice_date_iso: string | null;
    taxable_amount: number | null;
    vat_amount: number | null;
    grand_total: number | null;
    status: string;
}

export interface ExportRow {
    sn: number;
    vendor_name: string;
    seller_pan: string;
    invoice_number: string;
    invoice_date_bs: string;
    invoice_date_ad: string;
    taxable_amount: string;
    vat_amount: string;
    grand_total: string;
}

// -------------------------------------------------------------------
// SORTING
// -------------------------------------------------------------------

/**
 * Sort invoices by PRIMARY BS date for ledger order
 * 
 * BS date format: YYYY/MM/DD
 */
export function sortByBsDate(invoices: ExportableInvoice[]): ExportableInvoice[] {
    return [...invoices].sort((a, b) => {
        const dateA = a.invoice_date_bs || '';
        const dateB = b.invoice_date_bs || '';

        // String comparison works for YYYY/MM/DD format
        return dateA.localeCompare(dateB);
    });
}

// -------------------------------------------------------------------
// CSV GENERATION
// -------------------------------------------------------------------

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Convert invoices to CSV string
 */
export function invoicesToCSV(invoices: ExportableInvoice[]): string {
    // Sort by BS date
    const sorted = sortByBsDate(invoices);

    // Header row
    const headers = EXPORT_COLUMNS.map(c => c.label);
    const rows: string[][] = [headers];

    // Data rows
    sorted.forEach((inv, index) => {
        rows.push([
            String(index + 1),                          // S.N.
            inv.vendor_name || '',                      // Vendor Name
            inv.seller_pan || '',                       // PAN
            inv.invoice_number || '',                   // Invoice No.
            inv.invoice_date_bs || '',                  // Date (BS)
            inv.invoice_date_iso || '',                 // Date (AD)
            inv.taxable_amount?.toString() || '0',      // Taxable Amount
            inv.vat_amount?.toString() || '0',          // VAT Amount
            inv.grand_total?.toString() || '0',         // Total
        ]);
    });

    // Convert to CSV string
    return rows
        .map(row => row.map(escapeCSV).join(','))
        .join('\n');
}

/**
 * Convert invoices to array of export rows
 */
export function invoicesToRows(invoices: ExportableInvoice[]): ExportRow[] {
    const sorted = sortByBsDate(invoices);

    return sorted.map((inv, index) => ({
        sn: index + 1,
        vendor_name: inv.vendor_name || '',
        seller_pan: inv.seller_pan || '',
        invoice_number: inv.invoice_number || '',
        invoice_date_bs: inv.invoice_date_bs || '',
        invoice_date_ad: inv.invoice_date_iso || '',
        taxable_amount: inv.taxable_amount?.toString() || '0',
        vat_amount: inv.vat_amount?.toString() || '0',
        grand_total: inv.grand_total?.toString() || '0',
    }));
}

// -------------------------------------------------------------------
// SUMMARY STATISTICS
// -------------------------------------------------------------------

export interface ExportSummary {
    total_invoices: number;
    total_taxable: number;
    total_vat: number;
    total_amount: number;
    date_range: {
        from_bs: string | null;
        to_bs: string | null;
        from_ad: string | null;
        to_ad: string | null;
    };
}

/**
 * Calculate summary statistics for export
 */
export function calculateExportSummary(invoices: ExportableInvoice[]): ExportSummary {
    const sorted = sortByBsDate(invoices);

    let totalTaxable = 0;
    let totalVat = 0;
    let totalAmount = 0;

    for (const inv of invoices) {
        totalTaxable += inv.taxable_amount || 0;
        totalVat += inv.vat_amount || 0;
        totalAmount += inv.grand_total || 0;
    }

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    return {
        total_invoices: invoices.length,
        total_taxable: totalTaxable,
        total_vat: totalVat,
        total_amount: totalAmount,
        date_range: {
            from_bs: first?.invoice_date_bs || null,
            to_bs: last?.invoice_date_bs || null,
            from_ad: first?.invoice_date_iso || null,
            to_ad: last?.invoice_date_iso || null,
        }
    };
}

// -------------------------------------------------------------------
// FLAGGED INVOICE CHECK
// -------------------------------------------------------------------

/**
 * Check if workspace has any flagged invoices that block export
 * 
 * Rules:
 * - Flagged invoices with status != 'approved' block export
 * - Use force=true to override
 */
export async function checkFlaggedInvoices(
    workspaceId: string,
    supabase: any
): Promise<{
    hasFlags: boolean;
    flaggedCount: number;
    flaggedIds: string[];
}> {
    const { data: flagged } = await supabase
        .from('invoices')
        .select('id, invoice_flags(*)')
        .eq('workspace_id', workspaceId)
        .neq('status', 'approved');

    const flaggedInvoices = flagged?.filter((inv: any) => {
        const flags = inv.invoice_flags;
        return flags && (
            flags.missing_fields ||
            flags.math_mismatch ||
            flags.vat_inconsistent
        );
    }) || [];

    return {
        hasFlags: flaggedInvoices.length > 0,
        flaggedCount: flaggedInvoices.length,
        flaggedIds: flaggedInvoices.map((inv: any) => inv.id)
    };
}

// -------------------------------------------------------------------
// FISCAL YEAR HELPERS
// -------------------------------------------------------------------

/**
 * Determine Nepali fiscal year from BS date
 * 
 * Nepali fiscal year runs from Shrawan 1 (mid-July) to Ashadh 32 (mid-July next year)
 * FY 2080/81 = Shrawan 2080 to Ashadh 2081
 */
export function getFiscalYear(bsDate: string | null): string | null {
    if (!bsDate) return null;

    const match = bsDate.match(/^(\d{4})\/(\d{2})/);
    if (!match) return null;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);

    // Shrawan is month 4 (first month of fiscal year)
    // Months 4-12 belong to fiscal year starting that year
    // Months 1-3 belong to fiscal year that started previous year
    if (month >= 4) {
        return `${year}/${(year + 1) % 100}`;
    } else {
        return `${year - 1}/${year % 100}`;
    }
}

/**
 * Filter invoices by fiscal year
 */
export function filterByFiscalYear(
    invoices: ExportableInvoice[],
    fiscalYear: string
): ExportableInvoice[] {
    return invoices.filter(inv => getFiscalYear(inv.invoice_date_bs) === fiscalYear);
}
