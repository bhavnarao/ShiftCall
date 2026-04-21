import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY &&
  SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'shiftcall.supabase.auth',
      },
    })
  : null;

/**
 * Helpful runtime hint shown in the UI when Supabase isn't configured.
 * The app falls back to LOCAL DEMO MODE (localStorage-only auth + history).
 */
export const SUPABASE_MODE: 'cloud' | 'local-demo' = isSupabaseConfigured ? 'cloud' : 'local-demo';
