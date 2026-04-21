import { useEffect, useState, useCallback } from 'react';
import { supabase, SUPABASE_MODE } from './supabase';
import { useAuth } from './auth';

export interface SavedCall {
  id: string;
  user_id: string;
  customer: string;
  issue: string;
  duration: string;
  switch_at: string;
  sentiment: string;          // e.g. "+0.68"
  outcome: 'converted' | 'missed';
  industry: string;
  plan: string;
  support_exchanges: number;
  sales_exchanges: number;
  autonomous_score: number;
  frustration_handled: string;
  gratitude_spotting: string;
  sales_transition: string;
  sentiment_arc: number[];
  gratitude_trigger: string;
  pivot_reason: string;
  call_summary: string;
  revenue_added: string;
  switch_triggers: { label: string; met: boolean }[];
  created_at: string;
}

const STORAGE_KEY = (uid: string) => `shiftcall.calls.${uid}`;

export type NewCallInput = Omit<SavedCall, 'id' | 'user_id' | 'created_at'>;

export function useCalls() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<SavedCall[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setCalls([]); setLoading(false); return; }
    setLoading(true);

    if (SUPABASE_MODE === 'cloud' && supabase) {
      const { data } = await supabase
        .from('calls')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setCalls((data as SavedCall[]) || []);
    } else {
      try {
        const raw = localStorage.getItem(STORAGE_KEY(user.id));
        setCalls(raw ? JSON.parse(raw) : []);
      } catch {
        setCalls([]);
      }
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const insertCall = useCallback(async (input: NewCallInput): Promise<SavedCall | null> => {
    if (!user) return null;
    const record: SavedCall = {
      ...input,
      id: crypto.randomUUID(),
      user_id: user.id,
      created_at: new Date().toISOString(),
    };

    if (SUPABASE_MODE === 'cloud' && supabase) {
      const { data, error } = await supabase.from('calls').insert(record).select().single();
      if (error) {
        console.error('Failed to save call to Supabase:', error.message);
        return null;
      }
      const saved = (data as SavedCall) || record;
      setCalls((prev) => [saved, ...prev]);
      return saved;
    }

    const next = [record, ...calls];
    localStorage.setItem(STORAGE_KEY(user.id), JSON.stringify(next));
    setCalls(next);
    return record;
  }, [user?.id, calls]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    if (SUPABASE_MODE === 'cloud' && supabase) {
      await supabase.from('calls').delete().eq('user_id', user.id);
    } else {
      localStorage.removeItem(STORAGE_KEY(user.id));
    }
    setCalls([]);
  }, [user?.id]);

  return { calls, loading, insertCall, clearAll, refresh: load };
}
