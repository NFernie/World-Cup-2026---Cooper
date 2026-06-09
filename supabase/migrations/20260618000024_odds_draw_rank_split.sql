-- Odds leaderboard draws: lower FIFA-ranked team gets full draw odds; higher-ranked gets half.

create or replace function public.recalculate_pool_member_points(p_match_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_home_win boolean;
  v_away_win boolean;
  v_draw boolean;
  v_home_draw_points numeric;
  v_away_draw_points numeric;
begin
  -- Award points from locked match_odds (fetched once ~2h before kickoff).
  for r in
    select m.id as match_id,
           m.home_team_id,
           m.away_team_id,
           m.home_score,
           m.away_score,
           mo.home_win_decimal,
           mo.draw_decimal,
           mo.away_win_decimal
    from public.matches m
    inner join public.match_odds mo on mo.match_id = m.id
    where m.status = 'finished'
      and m.home_score is not null
      and m.away_score is not null
      and (p_match_id is null or m.id = p_match_id)
  loop
    v_home_win := r.home_score > r.away_score;
    v_away_win := r.away_score > r.home_score;
    v_draw := r.home_score = r.away_score;

    if v_draw then
      select
        case
          when coalesce(th.global_fifa_rank, 9999) > coalesce(ta.global_fifa_rank, 9999) then r.draw_decimal
          when coalesce(th.global_fifa_rank, 9999) < coalesce(ta.global_fifa_rank, 9999) then r.draw_decimal / 2
          else r.draw_decimal / 2
        end,
        case
          when coalesce(th.global_fifa_rank, 9999) > coalesce(ta.global_fifa_rank, 9999) then r.draw_decimal / 2
          when coalesce(th.global_fifa_rank, 9999) < coalesce(ta.global_fifa_rank, 9999) then r.draw_decimal
          else r.draw_decimal / 2
        end
      into v_home_draw_points, v_away_draw_points
      from public.teams th
      join public.teams ta on ta.id = r.away_team_id
      where th.id = r.home_team_id;

      insert into public.member_match_points (pool_member_id, match_id, points, win_odds_decimal)
      select
        pm.id,
        r.match_id,
        case
          when pm.assigned_team_id = r.home_team_id then v_home_draw_points
          else v_away_draw_points
        end,
        r.draw_decimal
      from public.pool_members pm
      where pm.assigned_team_id in (r.home_team_id, r.away_team_id)
      on conflict (pool_member_id, match_id) do update
        set points = excluded.points,
            win_odds_decimal = excluded.win_odds_decimal;
    elsif v_home_win then
      insert into public.member_match_points (pool_member_id, match_id, points, win_odds_decimal)
      select pm.id, r.match_id, r.home_win_decimal, r.home_win_decimal
      from public.pool_members pm
      where pm.assigned_team_id = r.home_team_id
      on conflict (pool_member_id, match_id) do update
        set points = excluded.points,
            win_odds_decimal = excluded.win_odds_decimal;
    elsif v_away_win then
      insert into public.member_match_points (pool_member_id, match_id, points, win_odds_decimal)
      select pm.id, r.match_id, r.away_win_decimal, r.away_win_decimal
      from public.pool_members pm
      where pm.assigned_team_id = r.away_team_id
      on conflict (pool_member_id, match_id) do update
        set points = excluded.points,
            win_odds_decimal = excluded.win_odds_decimal;
    end if;
  end loop;
end;
$$;

-- Re-score finished draws with the new split rule.
select public.recalculate_pool_member_points();
