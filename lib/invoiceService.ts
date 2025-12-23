import { supabase } from './supabaseClient';
import { InvoiceData, InvoiceStatus } from '../types';

export async function createInvoice(data: InvoiceData, workspaceId: string) {
    // 1. Prepare invoice record (snake_case matches database)
    const invoiceRecord = {
        workspace_id: workspaceId,
        vendor_name_en: data.vendor_name,
        invoice_number_en: data.invoice_number,
        invoice_date_raw: data.invoice_date_raw,
        taxable_amount: data.taxable_amount,
        vat_amount: data.vat_amount,
        grand_total: data.grand_total,
        currency: data.currency,
        line_items: data.line_items,
        other_charges: data.other_charges,
        status: data.status,
    };

    // Note: workspace_id logic needs to be robust. 
    // In init_db.sql, invoice references workspace_id.

    // Insert Invoice
    const { data: insertedInvoice, error } = await supabase
        .from('invoices')
        .insert({
            ...invoiceRecord,
        })
        .select()
        .single();

    if (error) {
        console.error('Error inserting invoice:', error);
        throw error;
    }

    // Insert Flags (if any)
    if (data.flags) {
        const { error: flagError } = await supabase
            .from('invoice_flags')
            .insert({
                invoice_id: insertedInvoice.id,
                math_mismatch: data.flags.math_mismatch,
                vat_inconsistent: data.flags.vat_inconsistent,
                missing_fields: data.flags.missing_fields
            });

        if (flagError) console.error('Error inserting flags:', flagError);
    }

    return insertedInvoice;
}

export async function fetchInvoices(workspaceId?: string) {
    let query = supabase
        .from('invoices')
        .select(`
      *,
      invoice_flags (*),
      invoice_pages (*)
    `)
        .order('created_at', { ascending: false });

    if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
}
