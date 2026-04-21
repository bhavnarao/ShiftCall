-- ─────────────────────────────────────────────────────────────────────
-- ShiftCall — Free trial counters
-- ─────────────────────────────────────────────────────────────────────
-- Adds trial tracking columns to profiles. Each new user gets 3 free
-- calls using the platform's shared keys before they need to bring
-- their own Vapi/Deepgram/xAI keys.
--
-- Run this in your Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists trial_calls_used  int     not null default 0,
  add column if not exists trial_limit       int     not null default 3,
  add column if not exists is_trial_active   boolean not null default false;

-- Helpful: existing users get the trial too if they haven't onboarded
update public.profiles
  set is_trial_active = true
  where onboarded = false and is_trial_active = false;
