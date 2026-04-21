import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, SUPABASE_MODE } from './supabase';

export interface AppUser {
  id: string;
  email: string;
  workspaceName: string;
  createdAt: string;
  onboarded: boolean;
}

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  mode: 'cloud' | 'local-demo';
  signUp: (email: string, password: string, workspaceName: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  markOnboarded: () => Promise<void>;
  updateWorkspace: (name: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

const LOCAL_USERS_KEY = 'shiftcall.local.users';
const LOCAL_SESSION_KEY = 'shiftcall.local.session';

interface LocalUserRecord {
  id: string;
  email: string;
  password: string; // demo only, plain text. Never use this in real auth.
  workspaceName: string;
  createdAt: string;
  onboarded: boolean;
}

function readLocalUsers(): LocalUserRecord[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]'); } catch { return []; }
}
function writeLocalUsers(users: LocalUserRecord[]) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}
function readLocalSession(): string | null {
  return localStorage.getItem(LOCAL_SESSION_KEY);
}
function writeLocalSession(userId: string | null) {
  if (userId) localStorage.setItem(LOCAL_SESSION_KEY, userId);
  else localStorage.removeItem(LOCAL_SESSION_KEY);
}

function toAppUser(record: LocalUserRecord): AppUser {
  return {
    id: record.id, email: record.email, workspaceName: record.workspaceName,
    createdAt: record.createdAt, onboarded: record.onboarded,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Bootstrap session on mount ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (SUPABASE_MODE === 'cloud' && supabase) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) { if (!cancelled) setLoading(false); return; }

        const u = data.session.user;
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
        if (!cancelled) {
          setUser({
            id: u.id,
            email: u.email || '',
            workspaceName: profile?.workspace_name || 'My Workspace',
            createdAt: u.created_at,
            onboarded: profile?.onboarded ?? false,
          });
          setLoading(false);
        }

        supabase.auth.onAuthStateChange(async (_evt, session) => {
          if (!session || !supabase) { setUser(null); return; }
          const su = session.user;
          let { data: p } = await supabase.from('profiles').select('*').eq('id', su.id).maybeSingle();

          // First time we've seen this user (e.g. fresh Google OAuth). Create profile row.
          if (!p) {
            const fallbackName =
              (su.user_metadata?.full_name as string) ||
              (su.user_metadata?.name as string) ||
              (su.email ? su.email.split('@')[0] : 'My Workspace');
            const { data: created } = await supabase.from('profiles').upsert({
              id: su.id,
              email: su.email,
              workspace_name: fallbackName,
              onboarded: false,
            }).select().maybeSingle();
            p = created || null;
          }

          setUser({
            id: su.id,
            email: su.email || '',
            workspaceName: p?.workspace_name || 'My Workspace',
            createdAt: su.created_at,
            onboarded: p?.onboarded ?? false,
          });
        });
      } else {
        // LOCAL DEMO MODE
        const sid = readLocalSession();
        if (sid) {
          const record = readLocalUsers().find(u => u.id === sid);
          if (record) setUser(toAppUser(record));
        }
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Sign up ────────────────────────────────────────────────
  const signUp: AuthCtx['signUp'] = useCallback(async (email, password, workspaceName) => {
    if (SUPABASE_MODE === 'cloud' && supabase) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: data.user.email,
          workspace_name: workspaceName,
          onboarded: false,
        });
      }
      return {};
    }

    // Local demo
    const users = readLocalUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return { error: 'An account with that email already exists.' };
    }
    const record: LocalUserRecord = {
      id: crypto.randomUUID(), email, password, workspaceName,
      createdAt: new Date().toISOString(), onboarded: false,
    };
    writeLocalUsers([...users, record]);
    writeLocalSession(record.id);
    setUser(toAppUser(record));
    return {};
  }, []);

  // ── Sign in ────────────────────────────────────────────────
  const signIn: AuthCtx['signIn'] = useCallback(async (email, password) => {
    if (SUPABASE_MODE === 'cloud' && supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return {};
    }

    const record = readLocalUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!record) return { error: 'No account found with that email.' };
    if (record.password !== password) return { error: 'Incorrect password.' };
    writeLocalSession(record.id);
    setUser(toAppUser(record));
    return {};
  }, []);

  // ── Sign in with Google (OAuth) ────────────────────────────
  const signInWithGoogle: AuthCtx['signInWithGoogle'] = useCallback(async () => {
    if (SUPABASE_MODE !== 'cloud' || !supabase) {
      return { error: 'Google sign-in requires Supabase. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your frontend env.' };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) return { error: error.message };
    // Browser is redirecting to Google now; nothing else to do.
    return {};
  }, []);

  // ── Sign out ───────────────────────────────────────────────
  const signOut = useCallback(async () => {
    if (SUPABASE_MODE === 'cloud' && supabase) {
      await supabase.auth.signOut();
    } else {
      writeLocalSession(null);
    }
    setUser(null);
  }, []);

  // ── Mark onboarded ─────────────────────────────────────────
  const markOnboarded = useCallback(async () => {
    if (!user) return;
    if (SUPABASE_MODE === 'cloud' && supabase) {
      await supabase.from('profiles').update({ onboarded: true }).eq('id', user.id);
    } else {
      const users = readLocalUsers();
      const idx = users.findIndex(u => u.id === user.id);
      if (idx >= 0) { users[idx].onboarded = true; writeLocalUsers(users); }
    }
    setUser({ ...user, onboarded: true });
  }, [user]);

  // ── Update workspace name ──────────────────────────────────
  const updateWorkspace = useCallback(async (name: string) => {
    if (!user) return;
    if (SUPABASE_MODE === 'cloud' && supabase) {
      await supabase.from('profiles').update({ workspace_name: name }).eq('id', user.id);
    } else {
      const users = readLocalUsers();
      const idx = users.findIndex(u => u.id === user.id);
      if (idx >= 0) { users[idx].workspaceName = name; writeLocalUsers(users); }
    }
    setUser({ ...user, workspaceName: name });
  }, [user]);

  return (
    <Ctx.Provider value={{ user, loading, mode: SUPABASE_MODE, signUp, signIn, signInWithGoogle, signOut, markOnboarded, updateWorkspace }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
