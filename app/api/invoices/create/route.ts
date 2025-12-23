import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/create
 * 
 * Creates a new invoice record and uploads associated page files.
 * 
 * Request Body:
 * - workspaceId: UUID of the workspace
 * - pages: Array of { base64: string, mimeType: string, pageNo: number }
 * 
 * The actual extraction happens via /api/invoices/finalize after pages are uploaded.
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
        const { workspaceId, pages } = body;

        if (!workspaceId) {
            return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
        }

        if (!pages || !Array.isArray(pages) || pages.length === 0) {
            return NextResponse.json({ error: 'Missing pages array' }, { status: 400 });
        }

        if (pages.length > 2) {
            return NextResponse.json({ error: 'Max 2 pages per invoice' }, { status: 400 });
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

        // 3. Check Membership
        const { data: membership } = await adminSupabase
            .from('memberships')
            .select('id')
            .eq('user_id', user.id)
            .eq('firm_id', workspace.firm_id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 4. Create Invoice Record (pending extraction)
        const { data: invoice, error: invoiceError } = await adminSupabase
            .from('invoices')
            .insert({
                workspace_id: workspaceId,
                status: 'pending_review'
            })
            .select('id')
            .single();

        if (invoiceError) {
            return NextResponse.json({ error: invoiceError.message }, { status: 500 });
        }

        // 5. Upload Pages to Storage and Create invoice_pages Records
        const pageRecords = [];

        for (const page of pages) {
            const { base64, mimeType, pageNo } = page;

            if (!base64 || !mimeType || pageNo === undefined) {
                // Rollback invoice if page data is invalid
                await adminSupabase.from('invoices').delete().eq('id', invoice.id);
                return NextResponse.json({ error: 'Invalid page data' }, { status: 400 });
            }

            // Determine file extension
            let ext = 'bin';
            if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
            else if (mimeType.includes('png')) ext = 'png';
            else if (mimeType.includes('pdf')) ext = 'pdf';

            const storagePath = `${workspaceId}/${invoice.id}/${pageNo}.${ext}`;

            // Decode base64 and upload
            const buffer = Buffer.from(base64, 'base64');
            const { error: uploadError } = await adminSupabase.storage
                .from('invoices')
                .upload(storagePath, buffer, {
                    contentType: mimeType,
                    upsert: false
                });

            if (uploadError) {
                // Rollback
                await adminSupabase.from('invoices').delete().eq('id', invoice.id);
                return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
            }

            // Create invoice_pages record
            const { error: pageError } = await adminSupabase
                .from('invoice_pages')
                .insert({
                    invoice_id: invoice.id,
                    page_no: pageNo,
                    storage_bucket: 'invoices',
                    storage_path: storagePath,
                    mime_type: mimeType
                });

            if (pageError) {
                // Rollback
                await adminSupabase.storage.from('invoices').remove([storagePath]);
                await adminSupabase.from('invoices').delete().eq('id', invoice.id);
                return NextResponse.json({ error: pageError.message }, { status: 500 });
            }

            pageRecords.push({ pageNo, storagePath });
        }

        return NextResponse.json({
            success: true,
            invoiceId: invoice.id,
            pages: pageRecords
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
