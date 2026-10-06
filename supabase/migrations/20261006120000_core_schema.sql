-- Phase 1: core schema (profiles, admin-only player data, app settings).
-- Rules enforced here, not in the UI:
--   * a profile is always created by trigger as player/pending, ignoring client metadata;
--   * stars and email live in an admin-only table, because RLS filters rows and not columns;
--   * no table accepts direct client writes; every write goes through a security definer function.

create type public.user_role as enum ('player', 'admin');
create type public.user_status as enum ('pending', 'approved', 'rejected', 'blocked');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  nickname text not null check (char_length(nickname) between 2 and 24),
  role public.user_role not null default 'player',
  status public.user_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Readable by the owner and by admins only.';

create index profiles_status_idx on public.profiles (status);
create index profiles_admin_idx on public.profiles (role) where role = 'admin';

-- Email and stars must never reach a player client, so they are not columns of profiles.
create table public.player_admin_data (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null,
  stars smallint check (stars between 1 and 5),
  stars_updated_at timestamptz,
  stars_updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.player_admin_data is 'Admin-only data. A null stars value counts as 3 in the team draw.';

-- Single row, holds the defaults used when creating a pelada.
create table public.app_settings (
  id boolean primary key default true check (id),
  default_location text not null default '' check (char_length(default_location) <= 120),
  default_slots smallint not null default 20 check (default_slots between 2 and 100),
  game_weekday smallint not null default 3 check (game_weekday between 0 and 6),
  game_time time not null default '20:00',
  open_weekday smallint not null default 1 check (open_weekday between 0 and 6),
  open_time time not null default '20:00',
  default_team_count smallint not null default 4 check (default_team_count between 2 and 10),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on column public.app_settings.game_weekday is 'ISO-free weekday, 0 = Sunday .. 6 = Saturday, in America/Sao_Paulo.';

insert into public.app_settings (id) values (true);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger app_settings_touch_updated_at
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- The profile is created here so the client can never choose its own role or status.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := coalesce(new.email, '');
  v_full_name text;
  v_nickname text;
begin
  v_full_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_nickname := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nickname', '')), '');

  v_full_name := coalesce(v_full_name, nullif(split_part(v_email, '@', 1), ''), 'Jogador');
  if char_length(v_full_name) < 2 then
    v_full_name := 'Jogador';
  end if;
  v_full_name := left(v_full_name, 80);

  v_nickname := coalesce(v_nickname, v_full_name);
  if char_length(v_nickname) < 2 then
    v_nickname := v_full_name;
  end if;
  v_nickname := left(v_nickname, 24);

  insert into public.profiles (id, full_name, nickname, role, status)
  values (new.id, v_full_name, v_nickname, 'player', 'pending');

  insert into public.player_admin_data (user_id, email)
  values (new.id, v_email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keeps the admin-visible email in sync when the account email changes.
create or replace function public.sync_player_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.player_admin_data
     set email = coalesce(new.email, '')
   where user_id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_player_email();
