import React from 'react';
import { useAuth } from '../lib/auth';
import { Info } from 'lucide-react';

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { mode } = useAuth();
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">S</div>
          <div className="auth-logo-text">ShiftCall</div>
        </div>

        {mode === 'local-demo' && (
          <div className="mode-banner">
            <Info size={14} />
            <span>
              Running in <strong>local demo mode</strong>. Accounts live in your browser only.
              Configure Supabase env vars to enable real cloud auth.
            </span>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
