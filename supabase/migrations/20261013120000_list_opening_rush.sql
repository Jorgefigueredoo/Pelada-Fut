-- The opening second, on the Supabase Free plan.
--
-- Two things broke down when ~100 phones are open as the list opens:
--
--   1. Realtime. The Free plan allows 100 messages per second, and a broadcast costs
--      one message per subscriber. One broadcast per join meant 100 joins x 100
--      phones, so Realtime started dropping every connection right when everyone
--      was watching. Broadcasts are now coalesced to at most one per pelada every
--      3 seconds. A change made inside that window is never lost: after any
--      broadcast the clients keep polling until the window has passed
--      (src/lib/list-sync.ts), so it is picked up by the poll instead of the push.
--
--   2. Building the list. _game_state built jsonb, which costs about twice as much
--      as plain json, and join_game builds it while holding the pelada's lock, so
--      every confirmation waited for every previous list to be built. It now builds
--      json in one statement, and every function that returns it returns json.
--
-- On top of that, every change bumps games.list_version, which lets a client ask
-- "anything new since version N?" and get a few bytes back when nothing changed,
-- and lets it throw away a response that arrived after a newer one.

alter table public.games
  add column list_version bigint not null default 0,
  add column broadcast_at timestamptz;

comment on column public.games.list_version is
  'Bumped by _broadcast_game on every change to the list or the pelada. Clients compare it instead of the content.';
comment on column public.games.broadcast_at is
  'When the last Realtime broadcast for this pelada went out. Broadcasts are coalesced against it.';

-- Every write to a list ends here. All callers already hold the pelada's row lock,
-- so the read-modify-write of broadcast_at below cannot race another writer.
create or replace function public._broadcast_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The only copy of this number: the clients read it from the payload.
  c_quiet_ms constant int := 3000;
  v_now timestamptz := clock_timestamp();
  v_version bigint;
  v_send boolean;
begin
  update public.games
     set list_version = list_version + 1,
         broadcast_at = case
           when broadcast_at is null
             or broadcast_at <= v_now - make_interval(secs => c_quiet_ms / 1000.0)
           then v_now
           else broadcast_at
         end
   where id = p_game_id
  returning list_version, broadcast_at = v_now
    into v_version, v_send;

  if v_send then
    perform realtime.send(
      jsonb_build_object('game_id', p_game_id, 'version', v_version, 'quiet_ms', c_quiet_ms),
      'list_changed',
      'game:' || p_game_id::text,
      true
    );
  end if;
end;
$$;

-- The functions below change their return type from jsonb to json, which
-- `create or replace` cannot do, so they are dropped and created again, grants
-- included. Their bodies are unchanged apart from the type.
drop function public._game_state(uuid, uuid, timestamptz);
drop function public.get_game_state(uuid);
drop function public.get_next_game();
drop function public.get_upcoming_games();
drop function public.join_game(uuid);
drop function public.leave_game(uuid);
drop function public.admin_update_game(uuid, timestamptz, text, smallint, timestamptz);
drop function public.admin_set_game_status(uuid, public.game_status);
drop function public.admin_add_player(uuid, uuid);
drop function public.admin_remove_player(uuid, uuid);

-- The one shape the clients read, now in a single statement: one snapshot, so the
-- list and "my position" can never disagree, and plain json, so nothing is parsed
-- into jsonb only to be printed back out. Same keys and values as before, plus
-- `version`. Only nickname and first name of other players: no email, no stars.
create function public._game_state(
  p_game_id uuid,
  p_user_id uuid,
  p_now timestamptz
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state json;
begin
  with active as (
    select s.seq,
           s.user_id,
           s.status,
           s.joined_at,
           s.added_by_admin,
           s.promoted_at,
           s.demoted_at,
           row_number() over (order by s.seq) as position
      from public.signups s
     where s.game_id = p_game_id
       and s.status <> 'out'
  )
  select json_build_object(
           'server_time', p_now,
           'version', g.list_version,
           'game', json_build_object(
             'id', g.id,
             'starts_at', g.starts_at,
             'location', g.location,
             'slots', g.slots,
             'list_opens_at', g.list_opens_at,
             'status', g.status,
             'is_open', g.status = 'scheduled'
                        and p_now >= g.list_opens_at
                        and p_now < g.starts_at
           ),
           'entries', coalesce((
             select json_agg(e order by e.seq)
               from (
                 select a.seq,
                        a.user_id,
                        p.nickname,
                        split_part(p.full_name, ' ', 1) as first_name,
                        p.avatar_path,
                        p.avatar_updated_at,
                        a.status,
                        a.joined_at,
                        a.added_by_admin,
                        a.position
                   from active a
                   join public.profiles p on p.id = a.user_id
               ) e
           ), '[]'::json),
           'my_signup', (
             select json_build_object(
                      'status', a.status,
                      'joined_at', a.joined_at,
                      'added_by_admin', a.added_by_admin,
                      'promoted_at', a.promoted_at,
                      'demoted_at', a.demoted_at,
                      'position', a.position
                    )
               from active a
              where a.user_id = p_user_id
           )
         )
    into v_state
    from public.games g
   where g.id = p_game_id;

  return v_state;
end;
$$;

-- Read path. Takes no lock, so a refetch never queues behind a write. With
-- p_known_version it answers "nothing changed" in a few bytes instead of the whole
-- list, which is what most polls get.
create function public.get_game_state(p_game_id uuid, p_known_version bigint default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_version bigint;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved() then raise exception 'NOT_APPROVED'; end if;

  if p_known_version is not null then
    select list_version into v_version from public.games where id = p_game_id;
    if v_version = p_known_version then
      return json_build_object('server_time', v_now, 'version', v_version, 'unchanged', true);
    end if;
  end if;

  return public._game_state(p_game_id, v_user, v_now);
end;
$$;

-- The nearest pelada that has not finished yet. A canceled pelada still shows, so
-- nobody turns up at the court for nothing.
create function public.get_next_game()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_game_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved() then raise exception 'NOT_APPROVED'; end if;

  select id into v_game_id
    from public.games
   where starts_at > v_now - interval '6 hours'
   order by starts_at
   limit 1;

  if v_game_id is null then
    return json_build_object('server_time', v_now, 'game', null);
  end if;

  return public._game_state(v_game_id, v_user, v_now);
end;
$$;

-- Every upcoming pelada, each in the exact shape _game_state produces.
create function public.get_upcoming_games()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_games json;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved() then raise exception 'NOT_APPROVED'; end if;

  -- A pelada stays visible for a few hours after kickoff instead of disappearing
  -- mid-game.
  select coalesce(json_agg(public._game_state(g.id, v_user, v_now) order by g.starts_at), '[]'::json)
    into v_games
    from public.games g
   where g.starts_at > v_now - interval '6 hours';

  return json_build_object('server_time', v_now, 'games', v_games);
end;
$$;

-- Confirm. Idempotent, so a double tap or a retry after a dropped connection
-- returns the same position instead of a second signup or an error.
create function public.join_game(p_game_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games;
  v_now timestamptz;
  v_active int;
  v_seq int;
  v_status public.signup_status;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved() then raise exception 'NOT_APPROVED'; end if;

  -- Everything below happens with this pelada's row locked.
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  -- The clock is read after the lock, so the time shown agrees with the order.
  v_now := clock_timestamp();

  if exists (
    select 1 from public.signups
     where game_id = p_game_id and user_id = v_user and status <> 'out'
  ) then
    return public._game_state(p_game_id, v_user, v_now);
  end if;

  if v_game.status = 'canceled' then raise exception 'GAME_CANCELED'; end if;
  if v_now < v_game.list_opens_at then raise exception 'LIST_NOT_OPEN'; end if;
  if v_now >= v_game.starts_at then raise exception 'GAME_STARTED'; end if;

  select count(*) into v_active
    from public.signups
   where game_id = p_game_id and status <> 'out';

  -- Safe only because of the lock, and backed up by _reconcile_game below.
  v_status := case when v_active + 1 <= v_game.slots then 'confirmed' else 'waitlist' end;

  v_seq := v_game.next_seq;
  update public.games set next_seq = next_seq + 1 where id = p_game_id;

  insert into public.signups (game_id, user_id, seq, status, joined_at)
  values (p_game_id, v_user, v_seq, v_status, v_now);

  insert into public.signup_events (game_id, user_id, type, actor_id, at, meta)
  values (p_game_id, v_user, 'joined', v_user, v_now,
          jsonb_build_object('seq', v_seq, 'status', v_status));

  perform public._reconcile_game(p_game_id, v_user, v_now);
  perform public._broadcast_game(p_game_id);

  return public._game_state(p_game_id, v_user, v_now);
end;
$$;

-- Drop out. Promotes the first player on the waitlist in the same transaction.
-- Coming back later takes a new seq, which is the end of the queue.
create function public.leave_game(p_game_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games;
  v_now timestamptz;
  v_signup public.signups;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved() then raise exception 'NOT_APPROVED'; end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  v_now := clock_timestamp();

  select * into v_signup
    from public.signups
   where game_id = p_game_id and user_id = v_user and status <> 'out';
  if not found then
    return public._game_state(p_game_id, v_user, v_now);
  end if;

  if v_game.status = 'canceled' then raise exception 'GAME_CANCELED'; end if;
  if v_now >= v_game.starts_at then raise exception 'GAME_STARTED'; end if;

  update public.signups
     set status = 'out', left_at = v_now
   where id = v_signup.id;

  insert into public.signup_events (game_id, user_id, type, actor_id, at, meta)
  values (p_game_id, v_user, 'left', v_user, v_now,
          jsonb_build_object('was', v_signup.status));

  perform public._reconcile_game(p_game_id, v_user, v_now);
  perform public._broadcast_game(p_game_id);

  return public._game_state(p_game_id, v_user, v_now);
end;
$$;

-- Changing the number of slots readjusts the list by arrival order, which is why this
-- runs inside the lock and ends in _reconcile_game like every other write.
create function public.admin_update_game(
  p_game_id uuid,
  p_starts_at timestamptz,
  p_location text,
  p_slots smallint,
  p_list_opens_at timestamptz
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_now timestamptz;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_starts_at is null or p_list_opens_at is null then raise exception 'INVALID_DATES'; end if;
  if p_list_opens_at > p_starts_at then raise exception 'OPENS_AFTER_START'; end if;
  if p_slots is null or p_slots < 2 or p_slots > 100 then raise exception 'INVALID_SLOTS'; end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  v_now := clock_timestamp();

  update public.games
     set starts_at = p_starts_at,
         location = btrim(coalesce(p_location, '')),
         slots = p_slots,
         list_opens_at = p_list_opens_at
   where id = p_game_id;

  if p_slots <> v_game.slots then
    insert into public.signup_events (game_id, type, actor_id, at, meta)
    values (p_game_id, 'slots_changed', auth.uid(), v_now,
            jsonb_build_object('from', v_game.slots, 'to', p_slots));
    perform public._reconcile_game(p_game_id, auth.uid(), v_now);
  end if;

  perform public._broadcast_game(p_game_id);

  return public._game_state(p_game_id, auth.uid(), v_now);
end;
$$;

-- Cancelling keeps the list, so uncancelling restores it exactly as it was.
-- Notifies every player still active on the list, confirmed or waiting: that is
-- who the change actually affects.
create function public.admin_set_game_status(
  p_game_id uuid,
  p_status public.game_status
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_now timestamptz;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  v_now := clock_timestamp();

  if v_game.status <> p_status then
    update public.games set status = p_status where id = p_game_id;

    insert into public.signup_events (game_id, type, actor_id, at)
    values (
      p_game_id,
      (case
         when p_status = 'canceled' then 'game_canceled'
         else 'game_reopened'
       end)::public.signup_event_type,
      auth.uid(),
      v_now
    );

    insert into public.notifications (user_id, type, game_id, meta)
    select s.user_id,
           (case
              when p_status = 'canceled' then 'game_canceled'
              else 'game_reopened'
            end)::public.notification_type,
           p_game_id,
           '{}'::jsonb
      from public.signups s
     where s.game_id = p_game_id
       and s.status <> 'out';

    perform public._broadcast_game(p_game_id);
  end if;

  return public._game_state(p_game_id, auth.uid(), v_now);
end;
$$;

-- Adding before the list opens is how a slot gets reserved. Allowed at any time,
-- including after kickoff, because only an admin can change the list by then.
create function public.admin_add_player(p_game_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_game public.games;
  v_now timestamptz;
  v_active int;
  v_seq int;
  v_status public.signup_status;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  if not exists (
    select 1 from public.profiles
     where id = p_user_id and status = 'approved'
  ) then
    raise exception 'PLAYER_NOT_APPROVED';
  end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  v_now := clock_timestamp();

  if exists (
    select 1 from public.signups
     where game_id = p_game_id and user_id = p_user_id and status <> 'out'
  ) then
    return public._game_state(p_game_id, v_actor, v_now);
  end if;

  select count(*) into v_active
    from public.signups
   where game_id = p_game_id and status <> 'out';

  v_status := case when v_active + 1 <= v_game.slots then 'confirmed' else 'waitlist' end;

  v_seq := v_game.next_seq;
  update public.games set next_seq = next_seq + 1 where id = p_game_id;

  insert into public.signups
    (game_id, user_id, seq, status, joined_at, added_by_admin, added_by)
  values (p_game_id, p_user_id, v_seq, v_status, v_now, true, v_actor);

  insert into public.signup_events (game_id, user_id, type, actor_id, at, meta)
  values (p_game_id, p_user_id, 'admin_added', v_actor, v_now,
          jsonb_build_object('seq', v_seq, 'status', v_status));

  perform public._notify(p_user_id, 'admin_added', p_game_id, '{}'::jsonb);

  perform public._reconcile_game(p_game_id, v_actor, v_now);
  perform public._broadcast_game(p_game_id);

  return public._game_state(p_game_id, v_actor, v_now);
end;
$$;

create function public.admin_remove_player(p_game_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_game public.games;
  v_now timestamptz;
  v_signup public.signups;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  v_now := clock_timestamp();

  select * into v_signup
    from public.signups
   where game_id = p_game_id and user_id = p_user_id and status <> 'out';
  if not found then
    return public._game_state(p_game_id, v_actor, v_now);
  end if;

  update public.signups
     set status = 'out', left_at = v_now
   where id = v_signup.id;

  insert into public.signup_events (game_id, user_id, type, actor_id, at, meta)
  values (p_game_id, p_user_id, 'admin_removed', v_actor, v_now,
          jsonb_build_object('was', v_signup.status));

  perform public._notify(p_user_id, 'admin_removed', p_game_id, '{}'::jsonb);

  perform public._reconcile_game(p_game_id, v_actor, v_now);
  perform public._broadcast_game(p_game_id);

  return public._game_state(p_game_id, v_actor, v_now);
end;
$$;

revoke all on function public._game_state(uuid, uuid, timestamptz) from public, anon, authenticated;

revoke all on function public.get_game_state(uuid, bigint) from public, anon;
revoke all on function public.get_next_game() from public, anon;
revoke all on function public.get_upcoming_games() from public, anon;
revoke all on function public.join_game(uuid) from public, anon;
revoke all on function public.leave_game(uuid) from public, anon;
revoke all on function public.admin_update_game(uuid, timestamptz, text, smallint, timestamptz) from public, anon;
revoke all on function public.admin_set_game_status(uuid, public.game_status) from public, anon;
revoke all on function public.admin_add_player(uuid, uuid) from public, anon;
revoke all on function public.admin_remove_player(uuid, uuid) from public, anon;

grant execute on function public.get_game_state(uuid, bigint) to authenticated;
grant execute on function public.get_next_game() to authenticated;
grant execute on function public.get_upcoming_games() to authenticated;
grant execute on function public.join_game(uuid) to authenticated;
grant execute on function public.leave_game(uuid) to authenticated;
grant execute on function public.admin_update_game(uuid, timestamptz, text, smallint, timestamptz) to authenticated;
grant execute on function public.admin_set_game_status(uuid, public.game_status) to authenticated;
grant execute on function public.admin_add_player(uuid, uuid) to authenticated;
grant execute on function public.admin_remove_player(uuid, uuid) to authenticated;
