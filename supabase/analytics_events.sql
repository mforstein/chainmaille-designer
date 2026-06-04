-- ============================================================================
-- Chainmail Studio — first-party analytics
-- Run this once in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Safe to re-run: everything is IF NOT EXISTS / idempotent.
-- ============================================================================

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  event       text        not null,
  props       jsonb       not null default '{}'::jsonb,
  path        text,
  anon_id     text,
  session_id  text,
  user_id     uuid,                       -- null when signed out
  tier        text,
  ts          timestamptz not null,       -- client event time
  created_at  timestamptz not null default now()  -- server insert time
);

create index if not exists analytics_events_event_idx   on public.analytics_events (event);
create index if not exists analytics_events_created_idx  on public.analytics_events (created_at);
create index if not exists analytics_events_session_idx  on public.analytics_events (session_id);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- The app uses the public anon key. We let anyone INSERT events, but NOBODY
-- can SELECT/UPDATE/DELETE with the anon or authenticated key. You read the
-- data from the Supabase dashboard (service role), which bypasses RLS.
alter table public.analytics_events enable row level security;

drop policy if exists "analytics insert (anon+auth)" on public.analytics_events;
create policy "analytics insert (anon+auth)"
  on public.analytics_events
  for insert
  to anon, authenticated
  with check (true);

-- No SELECT/UPDATE/DELETE policies → those operations are denied for client
-- keys. (Service role / dashboard still has full access.)
