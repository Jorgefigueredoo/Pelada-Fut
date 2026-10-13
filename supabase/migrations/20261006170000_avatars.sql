-- Profile pictures. Stored in Supabase Storage (object storage, served by the CDN),
-- never as bytes in a table, so a thousand photos never touch Postgres memory.
-- One fixed object per user (`<user_id>/avatar.webp`) means re-uploading replaces
-- the old file instead of accumulating orphans.

alter table public.profiles
  add column avatar_path text,
  add column avatar_updated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- A player manages only their own file, named after their own id.
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- The bucket is public (served straight from the CDN, no server round trip), so this
-- policy only covers the authenticated storage API (listing, signed downloads); it is
-- not what gatekeeps the public image URLs.
create policy avatars_select_all on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

-- The only write path into profiles.avatar_path. The path is pinned to
-- `<user_id>/avatar.webp`, matching the storage policies above exactly, so a player
-- can never point their profile at someone else's file.
create or replace function public.update_my_avatar(p_avatar_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
  v_path text := nullif(btrim(coalesce(p_avatar_path, '')), '');
  v_row public.profiles;
begin
  if v_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_approved() then
    raise exception 'NOT_APPROVED';
  end if;
  if v_path is not null and v_path <> (v_id::text || '/avatar.webp') then
    raise exception 'FORBIDDEN';
  end if;

  update public.profiles
     set avatar_path = v_path,
         avatar_updated_at = case when v_path is null then null else now() end
   where id = v_id
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'avatar_path', v_row.avatar_path,
    'avatar_updated_at', v_row.avatar_updated_at
  );
end;
$$;

revoke all on function public.update_my_avatar(text) from public, anon;
grant execute on function public.update_my_avatar(text) to authenticated;

-- Carries the avatar into the two reads that already return other players'
-- identities: the presence list and the admin directory.
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
             p.avatar_path,
             p.avatar_updated_at,
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
             p.avatar_path,
             p.avatar_updated_at,
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
