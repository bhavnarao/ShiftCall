-- ─────────────────────────────────────────────────────────────────────
-- ShiftCall — Supabase initial schema
-- ─────────────────────────────────────────────────────────────────────
-- Run this in your Supabase SQL editor (https://app.supabase.com →
-- your project → SQL → New query → paste → Run).
--
-- Tables:
--   profiles  — one row per signed-up user (links to auth.users)
--   calls     — every call session a user records via the Live Call page
--
-- Both tables are protected by Row-Level Security so a user can only
-- see and modify their own data.
-- ─────────────────────────────────────────────────────────────────────

-- ── profiles ────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid        primary key references auth.users(id) on delete cascade,
  email           text,
  workspace_name  text        not null default 'My Workspace',
  onboarded       boolean     not null default false,
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Profiles are updatable by owner" on public.profiles;
create policy "Profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id);


-- ── calls ──────────────────────────────────────────────────────────
create table if not exists public.calls (
  id                    uuid        primary key,
  user_id               uuid        not null references auth.users(id) on delete cascade,
  customer              text,
  issue                 text,
  duration              text,
  switch_at             text,
  sentiment             text,
  outcome               text        check (outcome in ('converted','missed')),
  industry              text,
  plan                  text,
  support_exchanges     int         default 0,
  sales_exchanges       int         default 0,
  autonomous_score      int         default 0,
  frustration_handled   text,
  gratitude_spotting    text,
  sales_transition      text,
  sentiment_arc         jsonb       default '[]',
  gratitude_trigger     text,
  pivot_reason          text,
  call_summary          text,
  revenue_added         text,
  switch_triggers       jsonb       default '[]',
  created_at            timestamptz not null default now()
);

create index if not exists calls_user_id_created_at_idx
  on public.calls (user_id, created_at desc);

alter table public.calls enable row level security;

drop policy if exists "Calls are viewable by owner" on public.calls;
create policy "Calls are viewable by owner"
  on public.calls for select
  using (auth.uid() = user_id);

drop policy if exists "Calls are insertable by owner" on public.calls;
create policy "Calls are insertable by owner"
  on public.calls for insert
  with check (auth.uid() = user_id);

drop policy if exists "Calls are updatable by owner" on public.calls;
create policy "Calls are updatable by owner"
  on public.calls for update
  using (auth.uid() = user_id);

drop policy if exists "Calls are deletable by owner" on public.calls;
create policy "Calls are deletable by owner"
  on public.calls for delete
  using (auth.uid() = user_id);

-- Done.
