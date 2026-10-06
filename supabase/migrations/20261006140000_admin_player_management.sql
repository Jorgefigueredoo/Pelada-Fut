-- Admin player management: paginated listing, editing another player's name, and a
-- safe path to delete an account (removing it from any list it is still on first).

-- Replaces the 2-argument version with pagination. Dropped explicitly so the old
-- signature does not linger as a second, unreachable overload.
drop function if exists public.admin_list_players(text, public.user_status);

create or replace function public.admin_list_players(
  p_search text default null,
  p_status public.user_status default null,
  p_page int default 1,
  p_per_page int default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_page int := greatest(1, coalesce(p_page, 1));
  v_per_page int := least(100, greatest(1, coalesce(p_per_page, 10)));
  v_items jsonb;
  v_total int;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select count(*)
    into v_total
    from public.profiles p
    left join public.player_admin_data d on d.user_id = p.id
   where (p_status is null or p.status = p_status)
     and (
       v_search is null
       or p.full_name ilike '%' || v_search || '%'
       or p.nickname ilike '%' || v_search || '%'
       or coalesce(d.email, '') ilike '%' || v_search || '%'
     );

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at), '[]'::jsonb)
    into v_items
    from (
      select p.id,
             p.full_name,
             p.nickname,
             p.role,
             p.status,
             p.created_at,
             d.email,
             d.stars
        from public.profiles p
        left join public.player_admin_data d on d.user_id = p.id
       where (p_status is null or p.status = p_status)
         and (
           v_search is null
           or p.full_name ilike '%' || v_search || '%'
           or p.nickname ilike '%' || v_search || '%'
           or coalesce(d.email, '') ilike '%' || v_search || '%'
         )
       order by p.created_at
       limit v_per_page
      offset (v_page - 1) * v_per_page
    ) t;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'per_page', v_per_page
  );
end;
$$;

-- Admin editing someone else's name and nickname, distinct from update_my_profile
-- which is self-service only.
create or replace function public.admin_update_player(
  p_user_id uuid,
  p_full_name text,
  p_nickname text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if char_length(v_full_name) < 2 or char_length(v_full_name) > 80 then
    raise exception 'INVALID_NAME';
  end if;
  if char_length(v_nickname) < 2 or char_length(v_nickname) > 24 then
    raise exception 'INVALID_NICKNAME';
  end if;

  update public.profiles
     set full_name = v_full_name,
         nickname = v_nickname
   where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'full_name', v_row.full_name,
    'nickname', v_row.nickname
  );
end;
$$;

-- Prepares an account for deletion: refuses to leave the app without an admin, and
-- takes the player off every list they are still active on, promoting the waitlist
-- the same way a normal drop-out would. The actual auth.users row is removed
-- afterwards through the Admin API (it owns sessions and refresh tokens, a plain SQL
-- delete would not clean those up); profiles and player_admin_data then cascade from
-- that, and signup_events keeps the history with the actor/target set to null.
create or replace function public.admin_prepare_player_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_count int;
  v_target public.profiles;
  v_game record;
  v_now timestamptz;
  v_removed int := 0;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtext('pelada:admin_guard'));

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if v_target.role = 'admin' and v_target.status = 'approved' then
    select count(*) into v_admin_count
      from public.profiles
     where role = 'admin' and status = 'approved';
    if v_admin_count <= 1 then
      raise exception 'LAST_ADMIN';
    end if;
  end if;

  for v_game in
    select distinct game_id from public.signups
     where user_id = p_user_id and status <> 'out'
  loop
    perform 1 from public.games where id = v_game.game_id for update;
    v_now := clock_timestamp();

    update public.signups
       set status = 'out', left_at = v_now
     where game_id = v_game.game_id
       and user_id = p_user_id
       and status <> 'out';

    insert into public.signup_events (game_id, user_id, type, actor_id, at, meta)
    values (v_game.game_id, p_user_id, 'admin_removed', auth.uid(), v_now,
            jsonb_build_object('reason', 'account_deleted'));

    perform public._reconcile_game(v_game.game_id, auth.uid(), v_now);
    perform public._broadcast_game(v_game.game_id);

    v_removed := v_removed + 1;
  end loop;

  return jsonb_build_object('affected_games', v_removed);
end;
$$;

revoke all on function public.admin_update_player(uuid, text, text) from public, anon;
revoke all on function public.admin_prepare_player_deletion(uuid) from public, anon;

grant execute on function public.admin_list_players(text, public.user_status, int, int) to authenticated;
grant execute on function public.admin_update_player(uuid, text, text) to authenticated;
grant execute on function public.admin_prepare_player_deletion(uuid) to authenticated;
