-- Prompt 005: draw odds points, team names, theme colours, host backfill

-- Fix placeholder teams (2026 draw)
update public.teams set fifa_code = 'CZE', name = 'Czechia' where fifa_code = 'UNK1';
update public.teams set fifa_code = 'BIH', name = 'Bosnia and Herzegovina' where fifa_code = 'UNK2';
update public.teams set fifa_code = 'TUR', name = 'Türkiye' where fifa_code = 'UNK3';
update public.teams set fifa_code = 'SWE', name = 'Sweden' where fifa_code = 'UNK4';
update public.teams set fifa_code = 'IRQ', name = 'Iraq' where fifa_code = 'UNK5';
update public.teams set fifa_code = 'COD', name = 'Congo DR' where fifa_code = 'UNK6';
update public.teams set fifa_code = 'PAN', name = 'Panama' where fifa_code = 'UNK7';
update public.teams set fifa_code = 'GHA', name = 'Ghana' where fifa_code = 'UNK8';

alter table public.teams
  add column if not exists primary_color text,
  add column if not exists secondary_color text;

-- Draw: award draw odds to members whose assigned team played in the match
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
begin
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
    join public.match_odds mo on mo.match_id = m.id
    where m.status = 'finished'
      and m.home_score is not null
      and m.away_score is not null
      and (p_match_id is null or m.id = p_match_id)
  loop
    v_home_win := r.home_score > r.away_score;
    v_away_win := r.away_score > r.home_score;
    v_draw := r.home_score = r.away_score;

    if v_draw then
      insert into public.member_match_points (pool_member_id, match_id, points, win_odds_decimal)
      select pm.id, r.match_id, r.draw_decimal, r.draw_decimal
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

-- Backfill: add pool hosts as members (separate team per pool via assign_team_for_pool_member)
insert into public.pool_members (
  pool_id, user_id, display_name, assigned_team_id, join_order, assignment_round
)
select
  p.id,
  p.host_user_id,
  coalesce(split_part(pr.email, '@', 1), 'Host'),
  public.assign_team_for_pool_member(p.id),
  coalesce((select max(pm.join_order) from public.pool_members pm where pm.pool_id = p.id), 0) + 1,
  coalesce((select max(pm.join_order) from public.pool_members pm where pm.pool_id = p.id), 0) / 48
from public.pools p
left join public.profiles pr on pr.id = p.host_user_id
where not exists (
  select 1 from public.pool_members pm
  where pm.pool_id = p.id and pm.user_id = p.host_user_id
);

-- Sample fixtures for UI (group stage openers)
insert into public.matches (home_team_id, away_team_id, kickoff_at, status, stage)
select
  h.id,
  a.id,
  t.kickoff_at,
  t.status::public.match_status,
  'group'::public.tournament_stage
from (values
  ('MEX', 'RSA', '2026-06-11 19:00:00+00'::timestamptz, 'scheduled'),
  ('KOR', 'CZE', '2026-06-12 02:00:00+00'::timestamptz, 'scheduled'),
  ('CAN', 'BIH', '2026-06-13 01:00:00+00'::timestamptz, 'scheduled'),
  ('USA', 'PAR', '2026-06-13 20:00:00+00'::timestamptz, 'scheduled'),
  ('BRA', 'MAR', '2026-06-14 22:00:00+00'::timestamptz, 'scheduled'),
  ('GER', 'CIV', '2026-06-15 19:00:00+00'::timestamptz, 'finished'),
  ('NED', 'JPN', '2026-06-16 01:00:00+00'::timestamptz, 'finished')
) as t(home_code, away_code, kickoff_at, status)
join public.teams h on h.fifa_code = t.home_code
join public.teams a on a.fifa_code = t.away_code
where not exists (
  select 1 from public.matches m
  where m.home_team_id = h.id and m.away_team_id = a.id
);

update public.matches set home_score = 2, away_score = 1
where id in (
  select m.id from public.matches m
  join public.teams h on h.id = m.home_team_id
  join public.teams a on a.id = m.away_team_id
  where h.fifa_code = 'GER' and a.fifa_code = 'CIV'
);

update public.matches set home_score = 1, away_score = 1
where id in (
  select m.id from public.matches m
  join public.teams h on h.id = m.home_team_id
  join public.teams a on a.id = m.away_team_id
  where h.fifa_code = 'NED' and a.fifa_code = 'JPN'
);

insert into public.match_odds (match_id, home_win_decimal, draw_decimal, away_win_decimal)
select m.id, o.home_w, o.draw_w, o.away_w
from public.matches m
join public.teams h on h.id = m.home_team_id
join public.teams a on a.id = m.away_team_id
join (values
  ('GER', 'CIV', 1.45, 4.50, 6.00),
  ('NED', 'JPN', 2.10, 3.40, 3.20)
) as o(home_c, away_c, home_w, draw_w, away_w) on h.fifa_code = o.home_c and a.fifa_code = o.away_c
on conflict (match_id) do nothing;

select public.recalculate_pool_member_points();

grant select on public.pool_team_co_managers to authenticated;
