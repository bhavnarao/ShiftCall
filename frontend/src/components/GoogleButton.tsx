import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';

// Official Google "G" logo (multi-color SVG, per Google branding guidelines)
const GoogleGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.7-3.9 2.7-6.61z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.55-1.84.87-3.04.87-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.97 10.73a5.39 5.39 0 0 1 0-3.46V4.96H.96A9.01 9.01 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.31z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A8.99 8.99 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.31C4.68 5.16 6.66 3.58 9 3.58z"
    />
  </svg>
);

interface Props {
  label?: string;        // e.g. "Continue with Google" or "Sign up with Google"
  onError?: (msg: string) => void;
}

function isDevHost() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
}

export function GoogleButton({ label = 'Continue with Google', onError }: Props) {
  const { signInWithGoogle, mode } = useAuth();
  const [loading, setLoading] = useState(false);

  // On a deployed host, if Supabase isn't configured we just hide the button
  // entirely — never show a dev-flavored "configure env vars" message to visitors.
  // On localhost we leave it visible so devs see what's missing.
  if (mode !== 'cloud' && !isDevHost()) return null;

  const disabled = mode !== 'cloud' || loading;

  const handleClick = async () => {
    if (mode !== 'cloud') return;
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setLoading(false);
      onError?.(error);
    }
    // On success the browser is redirecting to Google. No further state needed.
  };

  return (
    <div className="google-block">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="btn-google"
        title={mode !== 'cloud' ? 'Configure Supabase to enable Google sign-in' : undefined}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <GoogleGlyph />}
        <span>{loading ? 'Redirecting to Google…' : label}</span>
      </button>
      {mode !== 'cloud' && (
        <p className="google-hint">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
          <code>frontend/.env</code> to enable Google sign-in.
        </p>
      )}
    </div>
  );
}
