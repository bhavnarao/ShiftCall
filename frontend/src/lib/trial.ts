/**
 * ShiftCall — free-trial client.
 *
 * Talks to the backend /trial/* endpoints. Each call requires the user's
 * Supabase access token as a Bearer header; we read it from the live
 * Supabase session on demand.
 *
 * In `local-demo` mode (no Supabase configured) trial mode is unavailable
 * and these helpers return inert defaults so the rest of the UI doesn't
 * have to special-case it.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, SUPABASE_MODE } from './supabase';
import { useAuth } from './auth';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export interface TrialStatus {
  trialActive: boolean;
  used: number;
  limit: number;
  remaining: number;
  onboarded: boolean;
}

export interface TrialKeys {
  vapiPublicKey: string;
  deepgramToken: string;
  remainingBefore: number;
}

const INERT_STATUS: TrialStatus = {
  trialActive: false, used: 0, limit: 0, remaining: 0, onboarded: false,
};

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (SUPABASE_MODE !== 'cloud' || !supabase) {
    throw new Error('Trial requires Supabase. Configure SUPABASE env vars.');
  }
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

export async function fetchTrialStatus(): Promise<TrialStatus> {
  const r = await authedFetch('/trial/status', { method: 'GET' });
  if (!r.ok) throw new Error(`status ${r.status}`);
  const j = await r.json();
  return {
    trialActive: !!j.trial_active,
    used: j.used,
    limit: j.limit,
    remaining: j.remaining,
    onboarded: !!j.onboarded,
  };
}

export async function activateTrial(): Promise<void> {
  const r = await authedFetch('/trial/activate', { method: 'POST' });
  if (!r.ok) throw new Error(`activate failed (${r.status})`);
}

export async function fetchTrialKeys(): Promise<TrialKeys> {
  const r = await authedFetch('/trial/keys', { method: 'POST' });
  if (r.status === 403) {
    throw new Error('TRIAL_EXHAUSTED');
  }
  if (!r.ok) throw new Error(`keys failed (${r.status})`);
  const j = await r.json();
  return {
    vapiPublicKey: j.vapi_public_key,
    deepgramToken: j.deepgram_token,
    remainingBefore: j.remaining_before,
  };
}

export async function consumeTrialCall(): Promise<TrialStatus> {
  const r = await authedFetch('/trial/use', { method: 'POST' });
  if (!r.ok) throw new Error(`use failed (${r.status})`);
  const j = await r.json();
  return {
    trialActive: true,
    used: j.used,
    limit: j.limit,
    remaining: j.remaining,
    onboarded: true,
  };
}

/**
 * Reactive hook: returns the current trial status for the signed-in user
 * and a refresh function. Returns INERT_STATUS in local-demo mode.
 */
export function useTrial() {
  const { user } = useAuth();
  const [status, setStatus] = useState<TrialStatus>(INERT_STATUS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || SUPABASE_MODE !== 'cloud') {
      setStatus(INERT_STATUS);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await fetchTrialStatus();
      setStatus(s);
    } catch (e: any) {
      setError(e?.message || 'failed');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  return { status, loading, error, refresh };
}
