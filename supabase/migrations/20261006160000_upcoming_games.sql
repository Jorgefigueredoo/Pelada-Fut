-- The home screen used to show only the single nearest pelada (get_next_game).
-- It now lists every upcoming one, so creating a second pelada does not hide the
-- first. Each entry has the exact shape _game_state already produces, so the
-- client's per-game GameCard/useGameState code needs no change at all — it is
-- just rendered once per game instead of once for "the" game.
create or replace function public.get_upcoming_games()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_games jsonb;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved() then raise exception 'NOT_APPROVED'; end if;

  -- Same "not yet finished" window as get_next_game: a pelada stays visible for a
  -- few hours after kickoff instead of disappearing mid-game.
  select coalesce(jsonb_agg(public._game_state(g.id, v_user, v_now) order by g.starts_at), '[]'::jsonb)
    into v_games
    from public.games g
   where g.starts_at > v_now - interval '6 hours';

  return jsonb_build_object('server_time', v_now, 'games', v_games);
end;
$$;

revoke all on function public.get_upcoming_games() from public, anon;
grant execute on function public.get_upcoming_games() to authenticated;
