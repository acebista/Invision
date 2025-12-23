import { supabase } from './supabaseClient';

/**
 * Sign in with email and password.
 */
export async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;
    return data;
}

/**
 * Sign out the current user.
 */
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

/**
 * Get the current session.
 */
export async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
}

/**
 * Get the current user.
 */
export async function getUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
}

/**
 * Subscribe to auth state changes.
 */
export function onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
}

/**
 * Check if user is a member of any firm.
 * Returns the membership data if exists.
 */
export async function getUserMembership() {
    const user = await getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('memberships')
        .select('*, firms(*)')
        .eq('user_id', user.id)
        .single();

    if (error) return null;
    return data;
}

/**
 * Check if user is an admin of their firm.
 */
export async function isAdmin(): Promise<boolean> {
    const membership = await getUserMembership();
    return membership?.role === 'admin';
}

/**
 * Process a pending invite when user logs in.
 * Converts invite to membership if email matches.
 */
export async function processPendingInvite() {
    const user = await getUser();
    if (!user?.email) return null;

    // Check if already has membership
    const existingMembership = await getUserMembership();
    if (existingMembership) return existingMembership;

    // Check for pending invite
    const { data: invite, error } = await supabase
        .from('pending_invites')
        .select('*')
        .eq('email', user.email)
        .single();

    if (error || !invite) return null;

    // Note: The actual conversion (delete invite + create membership)
    // should be done server-side with admin privileges.
    // This is just for checking; call /api/auth/accept-invite for actual conversion.
    return invite;
}
