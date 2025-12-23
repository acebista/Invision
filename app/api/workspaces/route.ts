import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workspaces
 * Returns all workspaces for the user's firm.
 * 
 * POST /api/workspaces
 * Creates a new workspace (company + fiscal year combination).
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

    const adminSupabase = getServiceSupabase();

    // Get user's membership
    const { data: membership, error: memError } = await adminSupabase
        .from('memberships')
        .select('firm_id')
        .eq('user_id', user.id)
        .single();

    if (memError || !membership) {
        return NextResponse.json({ error: 'No firm membership' }, { status: 403 });
    }

    // Get all workspaces for the firm
    const { data: workspaces, error: wsError } = await adminSupabase
        .from('workspaces')
        .select(`
      *,
      companies(id, name),
      fiscal_years(id, label)
    `)
        .eq('firm_id', membership.firm_id)
        .order('created_at', { ascending: false });

    if (wsError) {
        return NextResponse.json({ error: wsError.message }, { status: 500 });
    }

    return NextResponse.json({ workspaces });
}

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
        const { companyName, fiscalYearLabel } = body;

        if (!companyName || !fiscalYearLabel) {
            return NextResponse.json({ error: 'Missing companyName or fiscalYearLabel' }, { status: 400 });
        }

        const adminSupabase = getServiceSupabase();

        // Get user's membership
        const { data: membership, error: memError } = await adminSupabase
            .from('memberships')
            .select('firm_id, role')
            .eq('user_id', user.id)
            .single();

        if (memError || !membership) {
            return NextResponse.json({ error: 'No firm membership' }, { status: 403 });
        }

        // Only admins can create workspaces
        if (membership.role !== 'admin') {
            return NextResponse.json({ error: 'Admins only' }, { status: 403 });
        }

        // Create or get existing company
        let companyId: string;
        const { data: existingCompany } = await adminSupabase
            .from('companies')
            .select('id')
            .eq('firm_id', membership.firm_id)
            .eq('name', companyName)
            .single();

        if (existingCompany) {
            companyId = existingCompany.id;
        } else {
            const { data: newCompany, error: compError } = await adminSupabase
                .from('companies')
                .insert({ firm_id: membership.firm_id, name: companyName })
                .select('id')
                .single();

            if (compError) {
                return NextResponse.json({ error: compError.message }, { status: 500 });
            }
            companyId = newCompany.id;
        }

        // Create or get existing fiscal year for this company
        let fiscalYearId: string;
        const { data: existingFY } = await adminSupabase
            .from('fiscal_years')
            .select('id')
            .eq('company_id', companyId)
            .eq('label', fiscalYearLabel)
            .single();

        if (existingFY) {
            fiscalYearId = existingFY.id;
        } else {
            const { data: newFY, error: fyError } = await adminSupabase
                .from('fiscal_years')
                .insert({ company_id: companyId, label: fiscalYearLabel })
                .select('id')
                .single();

            if (fyError) {
                return NextResponse.json({ error: fyError.message }, { status: 500 });
            }
            fiscalYearId = newFY.id;
        }

        // Check if workspace already exists
        const { data: existingWS } = await adminSupabase
            .from('workspaces')
            .select('id')
            .eq('company_id', companyId)
            .eq('fiscal_year_id', fiscalYearId)
            .single();

        if (existingWS) {
            return NextResponse.json({
                success: true,
                workspaceId: existingWS.id,
                message: 'Workspace already exists'
            });
        }

        // Create workspace
        const { data: workspace, error: wsError } = await adminSupabase
            .from('workspaces')
            .insert({
                firm_id: membership.firm_id,
                company_id: companyId,
                fiscal_year_id: fiscalYearId,
                is_locked: true
            })
            .select('id')
            .single();

        if (wsError) {
            return NextResponse.json({ error: wsError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            workspaceId: workspace.id,
            companyId,
            fiscalYearId
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
