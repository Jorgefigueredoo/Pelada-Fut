-- Broadcasts every 1 second instead of every 3.
--
-- Sized for the group as it is: about 40 phones open at the list opening. Each
-- broadcast costs one Realtime message per phone, so one per second is ~40 messages
-- per second against the Free plan's 100, which still leaves room for about 90 phones.
-- If the group grows past that, raise c_quiet_ms again (the clients read it from the
-- payload, so nothing else changes).

create or replace function public._broadcast_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The only copy of this number: the clients read it from the payload.
  c_quiet_ms constant int := 1000;
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
