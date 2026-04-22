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
  // CRITICAL: the onAuthStateChange listener has to be registered
  // unconditionally and BEFORE getSession() resolves. Otherwise the
  // SIGNED_IN event fired when Supabase parses the OAuth tokens out of
  // window.location.hash arrives before any listener is attached, and
  // the app gets stuck on /login even though the session is valid.
  useEffect(() => {
    let cancelled = false;

    if (SUPABASE_MODE !== 'cloud' || !supabase) {
      // LOCAL DEMO MODE
      const sid = readLocalSession();
      if (sid) {
        const record = readLocalUsers().find(u => u.id === sid);
        if (record) setUser(toAppUser(record));
      }
      setLoading(false);
      return;
    }

    // Loads (or creates if missing) the profile row for a Supabase user
    // and pushes it into local state. Never throws — on any failure we
    // fall back to a minimal user object so the UI keeps working.
    const hydrate = async (su: any) => {
      if (!supabase || cancelled) return;

      let workspaceName = 'My Workspace';
      let onboarded = false;

      try {
        // Race the profile fetch against a 4s timeout so a slow / hung
        // request can't pin loading=true forever.
        const fetchProfile = supabase
          .from('profiles')
          .select('*')
          .eq('id', su.id)
          .maybeSingle();

        const { data: p } = (await Promise.race([
          fetchProfile,
          new Promise((resolve) =>
            setTimeout(() => resolve({ data: null }), 4000),
          ),
        ])) as { data: any };

        if (p) {
          workspaceName = p.workspace_name || workspaceName;
          onboarded = p.onboarded ?? false;
        } else {
          // No profile row yet — common for fresh Google OAuth users.
          // Create one but don't block the UI on it.
          const fallbackName =
            (su.user_metadata?.full_name as string) ||
            (su.user_metadata?.name as string) ||
            (su.email ? su.email.split('@')[0] : 'My Workspace');
          workspaceName = fallbackName;
          // Fire-and-forget the upsert; we already know we'll show the
          // user the app immediately.
          supabase
            .from('profiles')
            .upsert({
              id: su.id,
              email: su.email,
              workspace_name: fallbackName,
              onboarded: false,
            })
            .then(() => undefined, (err: unknown) => {
              console.warn('[auth] profile upsert failed (non-fatal):', err);
            });
        }
      } catch (err) {
        console.warn('[auth] hydrate failed (non-fatal):', err);
      }

      if (cancelled) return;
      setUser({
        id: su.id,
        email: su.email || '',
        workspaceName,
        createdAt: su.created_at,
        onboarded,
      });
    };

    // Hard safety net: under no circumstance should loading stay true
    // for more than 6 seconds. If something is genuinely broken, the
    // user gets dumped to /login instead of staring at a blank screen.
    const loadingTimeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 6000);

    const finishLoading = () => {
      clearTimeout(loadingTimeout);
      if (!cancelled) setLoading(false);
    };

    // 1. Register the listener FIRST so we don't miss the SIGNED_IN event.
    const { data: listener } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      try {
        if (!session) {
          if (!cancelled) setUser(null);
          return;
        }
        await hydrate(session.user);
      } catch (err) {
        console.warn('[auth] onAuthStateChange handler failed:', err);
      } finally {
        finishLoading();
      }
    });

    // 2. THEN check for an existing session (covers the page-refresh case
    //    where we already have a session but no auth event fires).
    (async () => {
      try {
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await hydrate(data.session.user);
        }
      } catch (err) {
        console.warn('[auth] getSession bootstrap failed:', err);
      } finally {
        finishLoading();
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(loadingTimeout);
      listener?.subscription?.unsubscribe();
    };
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
