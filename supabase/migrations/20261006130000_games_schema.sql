-- Phase 2: the pelada and its list.
-- The whole point of this file is that the server, and only the server, decides the order.

create type public.game_status as enum ('scheduled', 'canceled');
create type public.signup_status as enum ('confirmed', 'waitlist', 'out');
create type public.signup_event_type as enum (
  'joined',
  'left',
  'promoted',
  'demoted',
  'admin_added',
  'admin_removed',
  'slots_changed',
  'game_canceled',
  'game_reopened'
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 120),
  slots smallint not null check (slots between 2 and 100),
  list_opens_at timestamptz not null,
  status public.game_status not null default 'scheduled',
  -- Arrival order counter, handed out inside the lock. Never reused.
  next_seq int not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_opens_before_start check (list_opens_at <= starts_at)
);

create index games_starts_at_idx on public.games (starts_at desc);

create trigger games_touch_updated_at
  before update on public.games
  for each row execute function public.touch_updated_at();

create table public.signups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Arrival order. Assigned inside the lock, so it can never collide or skip.
  seq int not null,
  status public.signup_status not null,
  -- clock_timestamp() read after the lock, not now(): now() is the transaction start
  -- and could contradict the order.
  joined_at timestamptz not null,
  left_at timestamptz,
  added_by_admin boolean not null default false,
  added_by uuid references public.profiles (id) on delete set null,
  promoted_at timestamptz,
  demoted_at timestamptz
);

-- One active signup per player per pelada. Leaving keeps the row as 'out',
-- so coming back takes a new seq and lands at the end of the queue.
create unique index signups_one_active_per_player
  on public.signups (game_id, user_id)
  where status <> 'out';

create unique index signups_seq_unique on public.signups (game_id, seq);
create index signups_game_order_idx on public.signups (game_id, seq) where status <> 'out';

create table public.signup_events (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  type public.signup_event_type not null,
  actor_id uuid references public.profiles (id) on delete set null,
  at timestamptz not null,
  meta jsonb not null default '{}'::jsonb
);

create index signup_events_game_idx on public.signup_events (game_id, at desc, id desc);

comment on table public.signup_events is 'Admin-visible history of every change to a list.';
