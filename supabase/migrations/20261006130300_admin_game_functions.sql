-- Phase 2: admin side of the pelada and the list.
-- Admin writes take the same lock as a player's, so an admin adding someone at the
-- opening second cannot race the queue either.

create or replace function public.get_app_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.app_settings;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_row from public.app_settings where id = true;

  return jsonb_build_object(
    'default_location', v_row.default_location,
    'default_slots', v_row.default_slots,
    'game_weekday', v_row.game_weekday,
    'game_time', v_row.game_time,
    'open_weekday', v_row.open_weekday,
    'open_time', v_row.open_time,
    'default_team_count', v_row.default_team_count
  );
end;
$$;

create or replace function public.admin_create_game(
  p_starts_at timestamptz,
  p_location text,
  p_slots smallint,
  p_list_opens_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_starts_at is null or p_list_opens_at is null then raise exception 'INVALID_DATES'; end if;
  if p_list_opens_at > p_starts_at then raise exception 'OPENS_AFTER_START'; end if;
  if p_slots is null or p_slots < 2 or p_slots > 100 then raise exception 'INVALID_SLOTS'; end if;

  insert into public.games (starts_at, location, slots, list_opens_at, created_by)
  values (p_starts_at, btrim(coalesce(p_location, '')), p_slots, p_list_opens_at, auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

-- Changing the number of slots readjusts the list by arrival order, which is why this
-- runs inside the lock and ends in _reconcile_game like every other write.
create or replace function public.admin_update_game(
  p_game_id uuid,
  p_starts_at timestamptz,
  p_location text,
  p_slots smallint,
  p_list_opens_at timestamptz
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

    perform public._broadcast_game(p_game_id);
  end if;

  return public._game_state(p_game_id, auth.uid(), v_now);
end;
$$;

-- Adding before the list opens is how a slot gets reserved. Allowed at any time,
-- including after kickoff, because only an admin can change the list by then.
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

  perform public._reconcile_game(p_game_id, v_actor, v_now);
  perform public._broadcast_game(p_game_id);

  return public._game_state(p_game_id, v_actor, v_now);
end;
$$;

create or replace function public.admin_list_games()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select coalesce(jsonb_agg(to_jsonb(g) order by g.starts_at desc), '[]'::jsonb)
    into v_result
    from (
      select gm.id,
             gm.starts_at,
             gm.location,
             gm.slots,
             gm.list_opens_at,
             gm.status,
             (select count(*) from public.signups s
               where s.game_id = gm.id and s.status = 'confirmed') as confirmed_count,
             (select count(*) from public.signups s
               where s.game_id = gm.id and s.status = 'waitlist') as waitlist_count
        from public.games gm
    ) g;

  return v_result;
end;
$$;

-- Admin-visible history: who did what, to whom, and when.
create or replace function public.get_game_history(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.at desc, h.id desc), '[]'::jsonb)
    into v_result
    from (
      select e.id,
             e.type,
             e.at,
             e.meta,
             target.nickname as target_nickname,
             actor.nickname as actor_nickname
        from public.signup_events e
        left join public.profiles target on target.id = e.user_id
        left join public.profiles actor on actor.id = e.actor_id
       where e.game_id = p_game_id
    ) h;

  return v_result;
end;
$$;

revoke all on function public._broadcast_game(uuid) from public, anon, authenticated;
revoke all on function public._reconcile_game(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public._game_state(uuid, uuid, timestamptz) from public, anon, authenticated;

revoke all on function public.get_game_state(uuid) from public, anon;
revoke all on function public.get_next_game() from public, anon;
revoke all on function public.join_game(uuid) from public, anon;
revoke all on function public.leave_game(uuid) from public, anon;
revoke all on function public.get_app_settings() from public, anon;
revoke all on function public.admin_create_game(timestamptz, text, smallint, timestamptz) from public, anon;
revoke all on function public.admin_update_game(uuid, timestamptz, text, smallint, timestamptz) from public, anon;
revoke all on function public.admin_set_game_status(uuid, public.game_status) from public, anon;
revoke all on function public.admin_add_player(uuid, uuid) from public, anon;
revoke all on function public.admin_remove_player(uuid, uuid) from public, anon;
revoke all on function public.admin_list_games() from public, anon;
revoke all on function public.get_game_history(uuid) from public, anon;

grant execute on function public.get_game_state(uuid) to authenticated;
grant execute on function public.get_next_game() to authenticated;
grant execute on function public.join_game(uuid) to authenticated;
grant execute on function public.leave_game(uuid) to authenticated;
grant execute on function public.get_app_settings() to authenticated;
grant execute on function public.admin_create_game(timestamptz, text, smallint, timestamptz) to authenticated;
grant execute on function public.admin_update_game(uuid, timestamptz, text, smallint, timestamptz) to authenticated;
grant execute on function public.admin_set_game_status(uuid, public.game_status) to authenticated;
grant execute on function public.admin_add_player(uuid, uuid) to authenticated;
grant execute on function public.admin_remove_player(uuid, uuid) to authenticated;
grant execute on function public.admin_list_games() to authenticated;
grant execute on function public.get_game_history(uuid) to authenticated;
