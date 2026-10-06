-- In-app notifications. Not push: nothing here depends on a service worker, a
-- subscription or a server that wakes the app up. A player only sees these when
-- they open the app themselves, which is why nothing in this app may depend on them
-- happening in real time.

create type public.notification_type as enum (
  'promoted',
  'demoted',
  'admin_added',
  'admin_removed',
  'approved',
  'game_canceled',
  'game_reopened',
  -- Reserved for the team draw (not built yet): kept here so that feature does not
  -- need its own migration just to extend this enum.
  'team_published'
);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  game_id uuid references public.games (id) on delete cascade,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create index notifications_user_recent_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- A player reads only their own notifications. No client writes at all: the only
-- path is _notify (called from the existing list/admin functions) and
-- mark_all_notifications_read below.
revoke insert, update, delete, truncate on public.notifications from anon, authenticated;
revoke all on public.notifications from anon;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Internal helper, not reachable by a client directly.
create or replace function public._notify(
  p_user_id uuid,
  p_type public.notification_type,
  p_game_id uuid,
  p_meta jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, game_id, meta)
  values (p_user_id, p_type, p_game_id, p_meta);
$$;

revoke all on function public._notify(uuid, public.notification_type, uuid, jsonb)
  from public, anon, authenticated;

-- One page, newest first, with the game's date and location joined in so the
-- client can show "Pelada de quarta, 20h" without a second round trip.
create or replace function public.get_my_notifications(p_limit int default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_limit int := least(100, greatest(1, coalesce(p_limit, 30)));
  v_items jsonb;
  v_unread int;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved() then raise exception 'NOT_APPROVED'; end if;

  select count(*) into v_unread
    from public.notifications
   where user_id = v_user and read_at is null;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v_items
    from (
      select n.id,
             n.type,
             n.meta,
             n.created_at,
             n.read_at,
             case when g.id is null then null else jsonb_build_object(
               'id', g.id,
               'starts_at', g.starts_at,
               'location', g.location
             ) end as game
        from public.notifications n
        left join public.games g on g.id = n.game_id
       where n.user_id = v_user
       order by n.created_at desc
       limit v_limit
    ) t;

  return jsonb_build_object('items', v_items, 'unread_count', v_unread);
end;
$$;

-- Simplest useful action: opening the bell marks everything read.
create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved() then raise exception 'NOT_APPROVED'; end if;

  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null;
end;
$$;

revoke all on function public.get_my_notifications(int) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.get_my_notifications(int) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
