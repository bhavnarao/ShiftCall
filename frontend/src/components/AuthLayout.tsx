import React from 'react';
import { useAuth } from '../lib/auth';
import { Info } from 'lucide-react';
import { Logo } from './Logo';

// Only show the demo banner on local dev hosts. In any deployed build (vercel.app,
// custom domain, etc.) we keep the UI clean so visitors never see dev-flavored
// "configure env vars" copy.
function isDevHost() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { mode } = useAuth();
  const showDemoBanner = mode === 'local-demo' && isDevHost();

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo size={26} accent />
        </div>

        {showDemoBanner && (
          <div className="mode-banner">
            <Info size={14} />
            <span>
              Running in <strong>local demo mode</strong>. Accounts live in your browser only.
            </span>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
