/**
 * Meetly - Supabase Authentication Module
 * Handles Google OAuth, Email/Password Signup & Login, Password Recovery,
 * and Persistent Session Synchronization with the Flask Backend.
 */

window.MeetlyAuth = (function() {
    let supabaseClient = null;
    let configPromise = null;

    async function getClient() {
        if (supabaseClient) return supabaseClient;
        if (!configPromise) {
            configPromise = fetch('/api/auth/config')
                .then(res => res.json())
                .then(cfg => {
                    if (!window.supabase) {
                        throw new Error('Supabase SDK not loaded. Please ensure CDN script is present.');
                    }
                    supabaseClient = window.supabase.createClient(cfg.supabase_url, cfg.supabase_key, {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true
                        }
                    });
                    return supabaseClient;
                });
        }
        return configPromise;
    }

    async function syncSessionToBackend(session) {
        if (!session || !session.access_token) return false;
        try {
            const res = await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: session.access_token,
                    user: session.user
                })
            });
            const data = await res.json();
            return data.status === 'success';
        } catch (err) {
            console.error('Failed to sync session to backend:', err);
            return false;
        }
    }

    async function signInWithGoogle() {
        const client = await getClient();
        const callbackUrl = window.location.origin + '/auth/callback';
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: callbackUrl,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });
        if (error) throw error;
        return data;
    }

    async function signUpWithEmail(name, email, password) {
        const client = await getClient();
        const cleanName = (name || '').trim();
        const cleanEmail = (email || '').trim().toLowerCase();
        
        const { data, error } = await client.auth.signUp({
            email: cleanEmail,
            password: password,
            options: {
                data: {
                    name: cleanName,
                    full_name: cleanName
                }
            }
        });
        if (error) throw error;

        // If session returned immediately (auto-confirm enabled)
        if (data.session) {
            await syncSessionToBackend(data.session);
            return { user: data.user, session: data.session, confirmed: true };
        }
        
        // Email confirmation is required
        return { user: data.user, session: null, confirmed: false };
    }

    async function signInWithEmail(email, password) {
        const client = await getClient();
        const cleanEmail = (email || '').trim().toLowerCase();

        const { data, error } = await client.auth.signInWithPassword({
            email: cleanEmail,
            password: password
        });
        if (error) throw error;

        if (data.session) {
            await syncSessionToBackend(data.session);
        }
        return data;
    }

    async function resetPassword(email) {
        const client = await getClient();
        const cleanEmail = (email || '').trim().toLowerCase();
        const resetUrl = window.location.origin + '/reset-password';

        const { data, error } = await client.auth.resetPasswordForEmail(cleanEmail, {
            redirectTo: resetUrl
        });
        if (error) throw error;
        return data;
    }

    async function signOut() {
        try {
            const client = await getClient();
            await client.auth.signOut();
        } catch (e) {
            console.warn('Supabase signOut error:', e);
        }
        window.location.href = '/logout';
    }

    async function getSession() {
        const client = await getClient();
        const { data: { session } } = await client.auth.getSession();
        return session;
    }

    // Initialize client immediately
    getClient().catch(err => console.warn('Supabase initialization deferral:', err));

    return {
        getClient,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        resetPassword,
        signOut,
        getSession,
        syncSessionToBackend
    };
})();
