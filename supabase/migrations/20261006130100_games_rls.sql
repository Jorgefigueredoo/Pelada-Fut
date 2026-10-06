-- Phase 2: RLS for the pelada and the list.
-- signups has RLS enabled and no policy at all: no client reads or writes it
-- directly, in either direction. Reads go through get_game_state, writes through
-- the locking functions.

alter table public.games enable row level security;
alter table public.signups enable row level security;
alter table public.signup_events enable row level security;

revoke insert, update, delete, truncate on public.games from anon, authenticated;
revoke insert, update, delete, truncate on public.signups from anon, authenticated;
revoke insert, update, delete, truncate on public.signup_events from anon, authenticated;
revoke all on public.games from anon;
revoke all on public.signups from anon, authenticated;
revoke all on public.signup_events from anon;

-- When the pelada happens is group information, so an approved player may read it.
create policy games_select_approved on public.games
  for select to authenticated
  using (public.is_approved());

-- The history is for admins.
create policy signup_events_select_admin on public.signup_events
  for select to authenticated
  using (public.is_admin());

-- Realtime Broadcast from the database. Authorization happens once, when the client
-- subscribes to the private channel, instead of per event per subscriber the way
-- Postgres Changes would.
create policy realtime_messages_select_approved on realtime.messages
  for select to authenticated
  using (public.is_approved() and realtime.topic() like 'game:%');
