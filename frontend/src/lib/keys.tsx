import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './auth';

export type KeyName = 'vapi' | 'deepgram' | 'anthropic';

export interface ApiKeys {
  vapi: string;
  deepgram: string;
  anthropic: string;
}

const EMPTY: ApiKeys = { vapi: '', deepgram: '', anthropic: '' };

function storageKeyFor(userId: string) {
  return `shiftcall.keys.${userId}`;
}

interface KeysCtx {
  keys: ApiKeys;
  hasAllRequired: boolean;
  missing: KeyName[];
  setKey: (name: KeyName, value: string) => void;
  setKeys: (next: Partial<ApiKeys>) => void;
  clearKey: (name: KeyName) => void;
  clearAll: () => void;
  validateKey: (name: KeyName, value: string) => Promise<{ ok: boolean; message: string }>;
}

const Ctx = createContext<KeysCtx | null>(null);

export function ApiKeysProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [keys, setKeysState] = useState<ApiKeys>(EMPTY);

  // Load from localStorage when the user changes
  useEffect(() => {
    if (!user) { setKeysState(EMPTY); return; }
    try {
      const raw = localStorage.getItem(storageKeyFor(user.id));
      setKeysState(raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY);
    } catch {
      setKeysState(EMPTY);
    }
  }, [user?.id]);

  // Persist on every change
  const persist = useCallback((next: ApiKeys) => {
    if (!user) return;
    localStorage.setItem(storageKeyFor(user.id), JSON.stringify(next));
    setKeysState(next);
  }, [user?.id]);

  const setKey = useCallback((name: KeyName, value: string) => {
    persist({ ...keys, [name]: value.trim() });
  }, [keys, persist]);

  const setKeys = useCallback((next: Partial<ApiKeys>) => {
    persist({ ...keys, ...next });
  }, [keys, persist]);

  const clearKey = useCallback((name: KeyName) => {
    persist({ ...keys, [name]: '' });
  }, [keys, persist]);

  const clearAll = useCallback(() => {
    if (!user) return;
    localStorage.removeItem(storageKeyFor(user.id));
    setKeysState(EMPTY);
  }, [user?.id]);

  const missing = (['vapi', 'deepgram', 'anthropic'] as KeyName[]).filter((k) => !keys[k]);
  const hasAllRequired = missing.length === 0;

  const validateKey: KeysCtx['validateKey'] = useCallback(async (name, value) => {
    const v = value.trim();
    if (!v) return { ok: false, message: 'Key is empty' };

    try {
      if (name === 'anthropic') {
        // Anthropic: a cheap models list call
        const r = await fetch('https://api.anthropic.com/v1/models', {
          method: 'GET',
          headers: {
            'x-api-key': v,
            'anthropic-version': '2023-06-01',
          },
        });
        if (r.ok) return { ok: true, message: 'Anthropic key verified.' };
        if (r.status === 401 || r.status === 403) return { ok: false, message: 'Invalid Anthropic key.' };
        return { ok: false, message: `Anthropic responded with HTTP ${r.status}.` };
      }

      if (name === 'deepgram') {
        const r = await fetch('https://api.deepgram.com/v1/projects', {
          method: 'GET',
          headers: { Authorization: `Token ${v}` },
        });
        if (r.ok) return { ok: true, message: 'Deepgram key verified.' };
        if (r.status === 401 || r.status === 403) return { ok: false, message: 'Invalid Deepgram key.' };
        return { ok: false, message: `Deepgram responded with HTTP ${r.status}.` };
      }

      if (name === 'vapi') {
        // Vapi *public* keys are client-safe and used to start a web call,
        // but Vapi has no public-key /me endpoint. We do a structural check
        // (UUID-like) and trust the runtime call to surface real errors.
        const looksOk = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
        return looksOk
          ? { ok: true, message: 'Vapi public key format looks valid (real check happens at call start).' }
          : { ok: false, message: 'Vapi public key format looks wrong (expected UUID).' };
      }
    } catch (e: any) {
      return { ok: false, message: `Network error: ${e?.message || 'unknown'}` };
    }
    return { ok: false, message: 'Unknown key type' };
  }, []);

  return (
    <Ctx.Provider value={{ keys, hasAllRequired, missing, setKey, setKeys, clearKey, clearAll, validateKey }}>
      {children}
    </Ctx.Provider>
  );
}

export function useKeys() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useKeys must be used inside <ApiKeysProvider>');
  return ctx;
}
