import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/export/csv
 * 
 * Exports approved invoices from a workspace as CSV.
 * 
 * Request Body:
 * - workspaceId: UUID
 * - force: boolean (optional) - if true, exports even if flagged invoices exist
 */
export async function POST(req: NextRequest) {
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

    try {
        const body = await req.json();
        const { workspaceId, force = false } = body;

        if (!workspaceId) {
            return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
        }

        const adminSupabase = getServiceSupabase();

        // 2. Validate Workspace Access
        const { data: workspace, error: wsError } = await adminSupabase
            .from('workspaces')
            .select('id, firm_id')
            .eq('id', workspaceId)
            .single();

        if (wsError || !workspace) {
            return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        const { data: membership } = await adminSupabase
            .from('memberships')
            .select('id')
            .eq('user_id', user.id)
            .eq('firm_id', workspace.firm_id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 3. Check for Flagged Invoices (if not forcing)
        if (!force) {
            const { data: flaggedInvoices } = await adminSupabase
                .from('invoices')
                .select('id, invoice_flags(*)')
                .eq('workspace_id', workspaceId)
                .eq('status', 'pending_review');

            const hasFlagged = flaggedInvoices?.some(inv => {
                const flags = inv.invoice_flags?.[0];
                return flags && (flags.math_mismatch || flags.vat_inconsistent || flags.missing_fields);
            });

            if (hasFlagged) {
                return NextResponse.json({
                    error: 'Export blocked: Flagged invoices exist. Use force=true to override.',
                    hasFlaggedInvoices: true
                }, { status: 409 });
            }
        }

        // 4. Fetch Approved Invoices
        const { data: invoices, error: fetchError } = await adminSupabase
            .from('invoices')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('status', 'approved')
            .order('invoice_date_iso', { ascending: true });

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!invoices || invoices.length === 0) {
            return NextResponse.json({ error: 'No approved invoices to export' }, { status: 404 });
        }

        // 5. Generate CSV
        const headers = [
            'Invoice ID',
            'Vendor Name',
            'Invoice Number',
            'Invoice Date (Raw)',
            'Invoice Date (ISO)',
            'Taxable Amount',
            'VAT Amount',
            'Grand Total',
            'Currency',
            'Status'
        ];

        const rows = invoices.map(inv => [
            inv.id,
            inv.vendor_name_en || '',
            inv.invoice_number_en || '',
            inv.invoice_date_raw || '',
            inv.invoice_date_iso || '',
            inv.taxable_amount?.toString() || '',
            inv.vat_amount?.toString() || '',
            inv.grand_total?.toString() || '',
            inv.currency || 'NPR',
            inv.status
        ]);

        // Escape CSV values
        const escapeCSV = (val: string) => {
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        };

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(escapeCSV).join(','))
        ].join('\n');

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="invoices_${workspaceId}.csv"`
            }
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
