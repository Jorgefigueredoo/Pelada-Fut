-- Phase 2: every write to a list, and the single read the clients poll.
--
-- The guarantee has four independent pieces:
--   1. `select ... for update` on the games row serializes all writes to that list.
--   2. `next_seq`, handed out inside the lock, defines arrival order.
--   3. A unique index on (game_id, seq) would reject a duplicate even if the code were wrong.
--   4. _reconcile_game decides confirmed vs waitlist from the order, never from a
--      count taken before an insert.

-- Minimal signal on the pelada's private channel. Clients refetch the list when they
-- get it, at most once a second, so the payload carries no list data.
create or replace function public._broadcast_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('game_id', p_game_id, 'at', clock_timestamp()),
    'list_changed',
    'game:' || p_game_id::text,
    true
  );
end;
$$;

-- Recomputes who is confirmed from the arrival order and records the moves.
-- Called at the end of every write, which is what makes "admin changed the number of
-- slots" and "someone dropped out" the same code path.
create or replace function public._reconcile_game(
  p_game_id uuid,
  p_actor uuid,
  p_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slots smallint;
begin
  select slots into v_slots from public.games where id = p_game_id;

  with ranked as (
    select s.id, s.user_id, s.status,
           row_number() over (order by s.seq) as pos
      from public.signups s
     where s.game_id = p_game_id
       and s.status <> 'out'
  ),
  promoted as (
    update public.signups s
       set status = 'confirmed',
           promoted_at = p_at,
           demoted_at = null
      from ranked r
     where s.id = r.id
       and r.pos <= v_slots
       and r.status = 'waitlist'
    returning s.user_id, r.pos
  ),
  demoted as (
    update public.signups s
       set status = 'waitlist',
           demoted_at = p_at,
           promoted_at = null
      from ranked r
     where s.id = r.id
       and r.pos > v_slots
       and r.status = 'confirmed'
    returning s.user_id, r.pos
  )
  insert into public.signup_events (game_id, user_id, type, actor_id, at, meta)
  select p_game_id, user_id, 'promoted'::public.signup_event_type, p_actor, p_at,
         jsonb_build_object('position', pos)
    from promoted
  union all
  select p_game_id, user_id, 'demoted'::public.signup_event_type, p_actor, p_at,
         jsonb_build_object('position', pos)
    from demoted;
end;
$$;

-- The one shape the clients read. Returns the server clock with it, so the countdown
-- is computed against the database and never against the phone.
-- Only nickname and first name of other players: no email, no stars, ever.
create or replace function public._game_state(
  p_game_id uuid,
  p_user_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_entries jsonb;
  v_mine jsonb;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.seq), '[]'::jsonb)
    into v_entries
    from (
      select s.seq,
             s.user_id,
             p.nickname,
             split_part(p.full_name, ' ', 1) as first_name,
             s.status,
             s.joined_at,
             s.added_by_admin,
             row_number() over (order by s.seq) as position
        from public.signups s
        join public.profiles p on p.id = s.user_id
       where s.game_id = p_game_id
         and s.status <> 'out'
    ) e;

  select to_jsonb(m) into v_mine
    from (
      select s.status,
             s.joined_at,
             s.added_by_admin,
             s.promoted_at,
             s.demoted_at,
             (select count(*)
                from public.signups o
               where o.game_id = p_game_id
                 and o.status <> 'out'
                 and o.seq <= s.seq) as position
        from public.signups s
       where s.game_id = p_game_id
         and s.user_id = p_user_id
         and s.status <> 'out'
    ) m;

  return jsonb_build_object(
    'server_time', p_now,
    'game', jsonb_build_object(
      'id', v_game.id,
      'starts_at', v_game.starts_at,
      'location', v_game.location,
      'slots', v_game.slots,
      'list_opens_at', v_game.list_opens_at,
      'status', v_game.status,
      'is_open', v_game.status = 'scheduled'
                 and p_now >= v_game.list_opens_at
                 and p_now < v_game.starts_at
    ),
    'entries', v_entries,
    'my_signup', coalesce(v_mine, 'null'::jsonb)
  );
end;
$$;

-- Read path. Takes no lock, so a refetch never queues behind a write.
create or replace function public.get_game_state(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved() then raise exception 'NOT_APPROVED'; end if;

  return public._game_state(p_game_id, v_user, clock_timestamp());
end;
$$;

-- The pelada the Inicio screen shows: the nearest one that has not finished yet.
-- A canceled pelada still shows, so nobody turns up at the court for nothing.
create or replace function public.get_next_game()
returns jsonb
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
    return jsonb_build_object('server_time', v_now, 'game', null);
  end if;

  return public._game_state(v_game_id, v_user, v_now);
end;
$$;

-- Confirm. Idempotent, so a double tap or a retry after a dropped connection
-- returns the same position instead of a second signup or an error.
create or replace function public.join_game(p_game_id uuid)
returns jsonb
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
create or replace function public.leave_game(p_game_id uuid)
returns jsonb
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
