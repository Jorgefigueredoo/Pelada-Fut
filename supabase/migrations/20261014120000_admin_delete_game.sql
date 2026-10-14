-- Deleting a pelada for good. Canceling keeps the list and can be undone; this does not.
--
-- signups, signup_events and notifications reference the game with
-- `on delete cascade`, so the list and its history go with it. Takes the same row
-- lock as every other write to a list, so a confirmation that is running at that
-- moment either finishes first or finds the pelada gone.
--
-- Players on the list of a pelada that has not happened (and was not already
-- canceled, which told them) get a notification that survives the delete: it has no
-- game_id, so the cascade does not take it, and carries the date and place in meta.

create or replace function public.admin_delete_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_now timestamptz;
  v_removed int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  v_now := clock_timestamp();

  select count(*) into v_removed
    from public.signups
   where game_id = p_game_id and status <> 'out';

  if v_game.status = 'scheduled' and v_game.starts_at > v_now then
    insert into public.notifications (user_id, type, game_id, meta)
    select s.user_id,
           'game_canceled'::public.notification_type,
           null,
           jsonb_build_object(
             'deleted', true,
             'starts_at', v_game.starts_at,
             'location', v_game.location
           )
      from public.signups s
     where s.game_id = p_game_id
       and s.status <> 'out';
  end if;

  delete from public.games where id = p_game_id;

  return jsonb_build_object('deleted', true, 'removed_signups', v_removed);
end;
$$;

revoke all on function public.admin_delete_game(uuid) from public, anon;
grant execute on function public.admin_delete_game(uuid) to authenticated;
