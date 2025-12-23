import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    // 1. Authenticate Caller
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userSupabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } = await userSupabase.auth.getUser(
        authHeader.replace('Bearer ', '')
    );

    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { invoiceId } = await req.json();
    if (!invoiceId) return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });

    const adminSupabase = getServiceSupabase();

    // 2. Validate Access (User member of firm owning invoice)
    // We do this by trying to fetch the invoice with RLS, or using admin client + manual check.
    // Using admin client for robustness in checking status.
    const { data: invoice, error: fetchError } = await adminSupabase
        .from('invoices')
        .select('*, workspaces(firm_id)')
        .eq('id', invoiceId)
        .single();

    if (fetchError || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    // Check membership
    const { data: membership } = await adminSupabase
        .from('memberships')
        .select('id')
        .eq('user_id', user.id)
        .eq('firm_id', invoice.workspaces.firm_id)
        .single();

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // 3. Create Job
    const { data: job, error: jobError } = await adminSupabase
        .from('jobs')
        .insert({
            invoice_id: invoiceId,
            type: 'extract',
            status: 'queued'
        })
        .select('id')
        .single();

    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });

    // 4. Trigger Edge Function
    // We fire and forget, OR await result. Prompt implies "process-invoice" does the heavy lift.
    // We call it via fetch.
    try {
        const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-invoice`;
        fetch(fnUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, // Secure call
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ jobId: job.id, invoiceId: invoiceId })
        });
    } catch (e) {
        console.error('Failed to trigger edge function', e);
        // Job remains queued, can be picked up by a cron later if failed.
    }

    return NextResponse.json({ success: true, jobId: job.id });
}
