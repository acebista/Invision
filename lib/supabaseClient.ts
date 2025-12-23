import { createClient } from '@supabase/supabase-js';

// Browser-safe Supabase client using anon key
// This respects RLS policies
export const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
