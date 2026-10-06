-- Phase 1: the only write path into profiles, player_admin_data and app_settings.
-- Messages are stable machine codes; the UI translates them to pt-BR.

-- A player edits their own name and nickname here instead of through an update policy.
-- This is what makes the classic "user updates own profile" role-escalation trap impossible.
create or replace function public.update_my_profile(p_full_name text, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_row public.profiles;
begin
  if v_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_approved() then
    raise exception 'NOT_APPROVED';
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
   where id = v_id
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'full_name', v_row.full_name,
    'nickname', v_row.nickname,
    'role', v_row.role,
    'status', v_row.status
  );
end;
$$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status public.user_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.profiles;
  v_admin_count int;
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

  update public.profiles
     set status = p_status
   where id = p_user_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'role', v_row.role, 'status', v_row.status);
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.profiles;
  v_admin_count int;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtext('pelada:admin_guard'));

  select * into v_row from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if v_row.role = 'admin' and p_role = 'player' then
    select count(*) into v_admin_count
      from public.profiles
     where role = 'admin' and status = 'approved';
    if v_admin_count <= 1 then
      raise exception 'LAST_ADMIN';
    end if;
  end if;

  if p_role = 'admin' and v_row.status <> 'approved' then
    raise exception 'APPROVE_FIRST';
  end if;

  update public.profiles
     set role = p_role
   where id = p_user_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'role', v_row.role, 'status', v_row.status);
end;
$$;

-- Null clears the rating; an unrated player counts as 3 in the draw.
create or replace function public.admin_set_stars(p_user_id uuid, p_stars smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stars smallint := p_stars;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if v_stars is not null and (v_stars < 1 or v_stars > 5) then
    raise exception 'INVALID_STARS';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  insert into public.player_admin_data (user_id, email, stars, stars_updated_at, stars_updated_by)
  values (p_user_id, '', v_stars, now(), auth.uid())
  on conflict (user_id) do update
     set stars = excluded.stars,
         stars_updated_at = excluded.stars_updated_at,
         stars_updated_by = excluded.stars_updated_by;

  return jsonb_build_object('user_id', p_user_id, 'stars', v_stars);
end;
$$;

-- Admin player directory: the only place email and stars are ever returned.
create or replace function public.admin_list_players(
  p_search text default null,
  p_status public.user_status default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at), '[]'::jsonb)
    into v_result
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
    ) t;

  return v_result;
end;
$$;

revoke all on function public.update_my_profile(text, text) from public, anon;
revoke all on function public.admin_set_user_status(uuid, public.user_status) from public, anon;
revoke all on function public.admin_set_user_role(uuid, public.user_role) from public, anon;
revoke all on function public.admin_set_stars(uuid, smallint) from public, anon;
revoke all on function public.admin_list_players(text, public.user_status) from public, anon;

grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.admin_set_user_status(uuid, public.user_status) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;
grant execute on function public.admin_set_stars(uuid, smallint) to authenticated;
grant execute on function public.admin_list_players(text, public.user_status) to authenticated;
