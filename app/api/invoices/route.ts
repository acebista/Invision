import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invoices?workspaceId=xxx
 * 
 * Lists all invoices for a workspace.
 * 
 * Query Params:
 * - workspaceId: UUID (required)
 * - status: 'pending_review' | 'approved' (optional)
 */
export async function GET(req: NextRequest) {
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
    const workspaceId = searchParams.get('workspaceId');
    const status = searchParams.get('status');

    if (!workspaceId) {
        return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }

    const adminSupabase = getServiceSupabase();

    // Validate workspace access
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

    // Build query
    let query = adminSupabase
        .from('invoices')
        .select(`
      *,
      invoice_pages(id, page_no, storage_path, mime_type),
      invoice_flags(*),
      jobs(id, status, created_at)
    `)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

    if (status) {
        query = query.eq('status', status);
    }

    const { data: invoices, error: fetchError } = await query;

    if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    return NextResponse.json({ invoices });
}
