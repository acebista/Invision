import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/approve
 * 
 * Approves an invoice after review.
 * 
 * Request Body:
 * - invoiceId: UUID
 */
export async function POST(req: NextRequest) {
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

    try {
        const body = await req.json();
        const { invoiceId } = body;

        if (!invoiceId) {
            return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
        }

        const adminSupabase = getServiceSupabase();

        // Fetch invoice
        const { data: invoice, error: fetchError } = await adminSupabase
            .from('invoices')
            .select('*, workspaces(firm_id)')
            .eq('id', invoiceId)
            .single();

        if (fetchError || !invoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        // Check membership
        const { data: membership } = await adminSupabase
            .from('memberships')
            .select('id')
            .eq('user_id', user.id)
            .eq('firm_id', invoice.workspaces.firm_id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Update status to approved
        const { error: updateError } = await adminSupabase
            .from('invoices')
            .update({
                status: 'approved',
                updated_at: new Date().toISOString()
            })
            .eq('id', invoiceId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, invoiceId });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
