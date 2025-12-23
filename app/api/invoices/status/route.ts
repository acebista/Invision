import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invoices/status?invoiceId=xxx
 * 
 * Returns the current status of an invoice including:
 * - Invoice metadata
 * - Job status
 * - Extraction results
 * - Validation flags
 */
export async function GET(req: NextRequest) {
    // 1. Authenticate Caller
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userSupabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } = await userSupabase.auth.getUser(
        authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get('invoiceId');

    if (!invoiceId) {
        return NextResponse.json({ error: 'Missing invoiceId query param' }, { status: 400 });
    }

    const adminSupabase = getServiceSupabase();

    // 2. Fetch Invoice with Related Data
    const { data: invoice, error: fetchError } = await adminSupabase
        .from('invoices')
        .select(`
      *,
      workspaces(firm_id, company_id, fiscal_year_id),
      invoice_pages(*),
      extractions(*),
      invoice_flags(*),
      jobs(*)
    `)
        .eq('id', invoiceId)
        .single();

    if (fetchError || !invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // 3. Check Membership
    const { data: membership } = await adminSupabase
        .from('memberships')
        .select('id')
        .eq('user_id', user.id)
        .eq('firm_id', invoice.workspaces.firm_id)
        .single();

    if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4. Find Latest Job Status
    const latestJob = invoice.jobs?.sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] || null;

    return NextResponse.json({
        invoiceId: invoice.id,
        status: invoice.status,
        mergeKey: invoice.merge_key,
        vendorName: invoice.vendor_name_en,
        invoiceNumber: invoice.invoice_number_en,
        invoiceDateRaw: invoice.invoice_date_raw,
        invoiceDateIso: invoice.invoice_date_iso,
        taxableAmount: invoice.taxable_amount,
        vatAmount: invoice.vat_amount,
        grandTotal: invoice.grand_total,
        currency: invoice.currency,
        pages: invoice.invoice_pages,
        extraction: invoice.extractions?.[0] || null,
        flags: invoice.invoice_flags?.[0] || null,
        job: latestJob
    });
}
