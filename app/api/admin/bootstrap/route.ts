import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const supabase = getServiceSupabase();

        // 1. Security Check: Are there ANY firms?
        const { count, error } = await supabase
            .from('firms')
            .select('*', { count: 'exact', head: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (count && count > 0) {
            return NextResponse.json({ error: 'System already bootstrapped' }, { status: 403 });
        }

        // 2. Parse User Identity (Caller) - passed via headers or body
        // In a real app, we verify the session token. 
        // For bootstrap, we assume the user just signed up and has a valid token which the client sends.
        // However, since we are using getServiceSupabase (admin), we need the User's ID.
        const body = await req.json();
        const { userId, email } = body;

        if (!userId || !email) {
            return NextResponse.json({ error: 'Missing userId or email' }, { status: 400 });
        }

        // 3. Create the First Firm
        const firmRes = await supabase
            .from('firms')
            .insert({ name: 'My First Firm' })
            .select('id')
            .single();

        if (firmRes.error) throw firmRes.error;

        // 4. Make User Admin
        const memberRes = await supabase
            .from('memberships')
            .insert({
                firm_id: firmRes.data.id,
                user_id: userId,
                role: 'admin'
            });

        if (memberRes.error) throw memberRes.error;

        return NextResponse.json({ success: true, firmId: firmRes.data.id });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
