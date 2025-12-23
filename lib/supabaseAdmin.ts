import { createClient } from '@supabase/supabase-js';

// NOTE: This client must ONLY be used in server-side contexts (API Routes, Server Actions)
// NEVER import this into a client-side component.
export const getServiceSupabase = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!url || !serviceKey) {
        throw new Error('Missing Supabase Service Key or URL');
    }

    return createClient(url, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
};
