import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useKeys } from '../lib/keys';
import { Settings, LogOut, KeyRound, AlertTriangle } from 'lucide-react';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const { hasAllRequired, missing } = useKeys();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!user) return null;

  const initials = user.email.slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    setOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full hover:bg-white/[0.05] transition-colors border border-transparent hover:border-white/10"
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
          style={{
            background: 'linear-gradient(135deg, rgba(45,212,191,0.30) 0%, rgba(129,140,248,0.30) 100%)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: '#F5F5F7',
            letterSpacing: '-0.01em',
          }}
        >
          {initials}
        </div>
        <span className="text-[12.5px] text-textMain font-medium hidden md:inline" style={{ letterSpacing: '-0.005em' }}>
          {user.workspaceName}
        </span>
        {!hasAllRequired && (
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" title={`${missing.length} key${missing.length === 1 ? '' : 's'} missing`} />
        )}
      </button>

      {open && (
        <div className="user-menu">
          <div className="user-menu-header" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="user-menu-name">{user.workspaceName}</div>
            <div className="user-menu-email">{user.email}</div>
          </div>

          {!hasAllRequired && (
            <button
              className="user-menu-item"
              style={{ color: '#F59E0B' }}
              onClick={() => { setOpen(false); navigate('/settings'); }}
            >
              <AlertTriangle size={14} />
              <div className="flex-1">
                <div className="text-[12.5px] font-medium">{missing.length} API key{missing.length === 1 ? '' : 's'} missing</div>
                <div className="text-[11px] text-textMuted">Add to enable live calls</div>
              </div>
            </button>
          )}

          <button className="user-menu-item" onClick={() => { setOpen(false); navigate('/settings'); }}>
            <Settings size={14} /> Settings
          </button>
          <button className="user-menu-item" onClick={() => { setOpen(false); navigate('/settings'); }}>
            <KeyRound size={14} /> API keys
          </button>

          <div className="user-menu-divider" />

          <button className="user-menu-item danger" onClick={handleLogout}>
            <LogOut size={14} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
