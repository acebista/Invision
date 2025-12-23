import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/accept-invite
 * 
 * Called after a user logs in to convert their pending invite to a membership.
 * This endpoint requires the user to be authenticated.
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

    if (authError || !user || !user.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = getServiceSupabase();

    try {
        // 2. Check if user already has a membership
        const { data: existingMembership } = await adminSupabase
            .from('memberships')
            .select('id')
            .eq('user_id', user.id)
            .single();

        if (existingMembership) {
            return NextResponse.json({
                success: true,
                message: 'Already a member',
                membershipId: existingMembership.id
            });
        }

        // 3. Find pending invite for this email
        const { data: invite, error: inviteError } = await adminSupabase
            .from('pending_invites')
            .select('*')
            .eq('email', user.email)
            .single();

        if (inviteError || !invite) {
            return NextResponse.json({
                error: 'No pending invite found for this email'
            }, { status: 404 });
        }

        // 4. Create membership
        const { data: membership, error: memberError } = await adminSupabase
            .from('memberships')
            .insert({
                firm_id: invite.firm_id,
                user_id: user.id,
                role: invite.role
            })
            .select('id')
            .single();

        if (memberError) {
            return NextResponse.json({ error: memberError.message }, { status: 500 });
        }

        // 5. Delete the pending invite
        await adminSupabase
            .from('pending_invites')
            .delete()
            .eq('id', invite.id);

        return NextResponse.json({
            success: true,
            membershipId: membership.id,
            firmId: invite.firm_id,
            role: invite.role
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
