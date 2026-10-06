-- Wires _notify into the functions that already change something a player cares
-- about. Each one is a plain `create or replace` of a function from an earlier
-- migration, not a new function, so the single write path per table is unchanged.

-- _reconcile_game: same promoted/demoted rows that already feed signup_events now
-- also feed notifications, via the signup_events insert's own RETURNING instead of
-- recomputing anything.
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
  ),
  events_ins as (
    insert into public.signup_events (game_id, user_id, type, actor_id, at, meta)
    select p_game_id, user_id, 'promoted'::public.signup_event_type, p_actor, p_at,
           jsonb_build_object('position', pos)
      from promoted
    union all
    select p_game_id, user_id, 'demoted'::public.signup_event_type, p_actor, p_at,
           jsonb_build_object('position', pos)
      from demoted
    returning user_id, type, meta
  )
  insert into public.notifications (user_id, type, game_id, meta)
  select user_id, type::text::public.notification_type, p_game_id, meta
    from events_ins;
end;
$$;

create or replace function public.admin_add_player(p_game_id uuid, p_user_id uuid)
returns jsonb
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

create or replace function public.admin_remove_player(p_game_id uuid, p_user_id uuid)
returns jsonb
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

-- Notifies every player still active on the list, confirmed or waiting, when a
-- pelada is canceled or reopened: that is who the change actually affects.
create or replace function public.admin_set_game_status(
  p_game_id uuid,
  p_status public.game_status
)
returns jsonb
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

-- Notifies a player the moment their account is approved: that is what unblocks them.
create or replace function public.admin_set_user_status(p_user_id uuid, p_status public.user_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.profiles;
  v_admin_count int;
  v_was_approved boolean;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  -- Serializes the last-admin check so two admins cannot both pass it.
  perform pg_advisory_xact_lock(hashtext('pelada:admin_guard'));

  select * into v_row from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if v_row.role = 'admin' and v_row.status = 'approved' and p_status <> 'approved' then
    select count(*) into v_admin_count
      from public.profiles
     where role = 'admin' and status = 'approved';
    if v_admin_count <= 1 then
      raise exception 'LAST_ADMIN';
    end if;
  end if;

  v_was_approved := v_row.status = 'approved';

  update public.profiles
     set status = p_status
   where id = p_user_id
  returning * into v_row;

  if p_status = 'approved' and not v_was_approved then
    perform public._notify(p_user_id, 'approved', null, '{}'::jsonb);
  end if;

  return jsonb_build_object('id', v_row.id, 'role', v_row.role, 'status', v_row.status);
end;
$$;
