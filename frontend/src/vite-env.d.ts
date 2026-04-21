/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;

  // Legacy / optional: used as fallback if user hasn't entered keys yet.
  // Per-user keys (entered in onboarding) take precedence.
  readonly VITE_VAPI_PUBLIC_KEY?: string;
  readonly VITE_DEEPGRAM_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
