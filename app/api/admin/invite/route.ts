import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    // 1. Authenticate Caller
    // We use the standard supabase client to verify the caller's JWT
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

    const { email, firmId } = await req.json();

    if (!email || !firmId) {
        return NextResponse.json({ error: 'Missing email or firmId' }, { status: 400 });
    }

    const adminSupabase = getServiceSupabase();

    // 2. Authorization: Is Caller an Admin of this firm?
    const { data: membership } = await adminSupabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('firm_id', firmId)
        .single();

    if (!membership || membership.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
    }

    // 3. Create Invite
    const { error } = await adminSupabase
        .from('pending_invites')
        .insert({
            firm_id: firmId,
            email: email,
            role: 'member'
        });

    if (error) {
        // Handle unique constraint (already invited) gracefully
        if (error.code === '23505') {
            return NextResponse.json({ error: 'User already invited' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // NOTE: In a real app, we would send an email here via Resend/SendGrid.
    // For this scope, we just record the invite in DB.

    return NextResponse.json({ success: true });
}
