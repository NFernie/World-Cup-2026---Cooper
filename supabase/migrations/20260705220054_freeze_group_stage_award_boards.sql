-- Freeze Wooden Spoon and People's Champion at end of group stage (before Round of 32, 29 Jun 2026).

create table if not exists public.frozen_group_stage_award_board (
  board text not null check (board in ('wooden_spoon', 'peoples_champion')),
  team_id uuid not null references public.teams (id) on delete cascade,
  team_name text not null,
  fifa_code text not null,
  tournament_stage public.tournament_stage not null,
  global_fifa_rank int,
  tournament_rank int,
  group_letter char(1),
  group_position int,
  board_rank bigint not null,
  frozen_at timestamptz not null default '2026-06-29 00:00:00+00'::timestamptz,
  primary key (board, team_id)
);

create index if not exists frozen_group_stage_award_board_board_rank_idx
  on public.frozen_group_stage_award_board (board, board_rank);

comment on table public.frozen_group_stage_award_board is
  'Wooden Spoon and People''s Champion locked at group-stage end (before R32 kickoff).';

truncate public.frozen_group_stage_award_board;

-- Reconstruct group-stage qualification from finished group matches only.
with match_results as (
  select
    m.home_team_id as team_id,
    case
      when m.home_score > m.away_score then 3
      when m.home_score = m.away_score then 1
      else 0
    end as points,
    (m.home_score - m.away_score)::int as goal_difference,
    m.home_score::int as goals_for
  from public.matches m
  join public.teams th on th.id = m.home_team_id
  join public.teams ta on ta.id = m.away_team_id
  where m.stage = 'group'
    and m.status = 'finished'
    and m.home_score is not null
    and m.away_score is not null
    and th.group_letter = ta.group_letter
  union all
  select
    m.away_team_id,
    case
      when m.away_score > m.home_score then 3
      when m.away_score = m.home_score then 1
      else 0
    end,
    (m.away_score - m.home_score)::int,
    m.away_score::int
  from public.matches m
  join public.teams th on th.id = m.home_team_id
  join public.teams ta on ta.id = m.away_team_id
  where m.stage = 'group'
    and m.status = 'finished'
    and m.home_score is not null
    and m.away_score is not null
    and th.group_letter = ta.group_letter
),
aggregates as (
  select
    team_id,
    sum(points)::int as points,
    sum(goal_difference)::int as goal_difference,
    sum(goals_for)::int as goals_for
  from match_results
  group by team_id
),
team_stats as (
  select
    t.id,
    t.name,
    t.fifa_code,
    t.group_letter,
    t.global_fifa_rank,
    t.tournament_rank,
    coalesce(a.points, 0)::int as group_points,
    coalesce(a.goal_difference, 0)::int as group_goal_difference,
    coalesce(a.goals_for, 0)::int as goals_for
  from public.teams t
  left join aggregates a on a.team_id = t.id
  where t.group_letter is not null
),
group_ranked as (
  select
    ts.id,
    ts.name,
    ts.fifa_code,
    ts.group_letter,
    ts.global_fifa_rank,
    ts.tournament_rank,
    row_number() over (
      partition by ts.group_letter
      order by ts.group_points desc, ts.group_goal_difference desc, ts.goals_for desc, ts.name asc
    )::int as group_position
  from team_stats ts
),
group_sizes as (
  select group_letter, count(*)::int as team_count
  from public.teams
  where group_letter is not null
  group by group_letter
),
finished_group_games as (
  select th.group_letter, count(*)::int as played
  from public.matches m
  join public.teams th on th.id = m.home_team_id
  join public.teams ta on ta.id = m.away_team_id
  where m.stage = 'group'
    and m.status = 'finished'
    and m.home_score is not null
    and m.away_score is not null
    and th.group_letter = ta.group_letter
  group by th.group_letter
),
complete_groups as (
  select gs.group_letter
  from group_sizes gs
  left join finished_group_games fg on fg.group_letter = gs.group_letter
  where coalesce(fg.played, 0) >= (gs.team_count * (gs.team_count - 1) / 2)
),
group_count as (
  select count(distinct group_letter)::int as total
  from public.teams
  where group_letter is not null
),
third_placed as (
  select
    gr.id,
    gr.name,
    gr.fifa_code,
    gr.group_letter,
    gr.global_fifa_rank,
    gr.tournament_rank,
    gr.group_position,
    ts.group_points,
    ts.group_goal_difference,
    ts.goals_for
  from group_ranked gr
  join team_stats ts on ts.id = gr.id
  inner join complete_groups cg on cg.group_letter = gr.group_letter
  where gr.group_position = 3
),
ranked_thirds as (
  select
    id,
    name,
    fifa_code,
    group_letter,
    global_fifa_rank,
    tournament_rank,
    group_position,
    row_number() over (
      order by group_points desc, group_goal_difference desc, goals_for desc, name asc
    )::int as third_rank
  from third_placed
),
qualifiers as (
  select gr.id
  from group_ranked gr
  inner join complete_groups cg on cg.group_letter = gr.group_letter
  where gr.group_position <= 2
  union
  select rt.id
  from ranked_thirds rt
  cross join group_count gc
  where rt.third_rank <= 8
    and (select count(*)::int from complete_groups) = gc.total
),
group_eliminated as (
  select
    gr.id,
    gr.name,
    gr.fifa_code,
    gr.group_letter,
    gr.global_fifa_rank,
    gr.tournament_rank,
    gr.group_position
  from group_ranked gr
  inner join complete_groups cg on cg.group_letter = gr.group_letter
  where gr.id not in (select id from qualifiers)
),
wooden_spoon_rows as (
  select
    ge.*,
    row_number() over (
      order by ge.global_fifa_rank asc nulls last, ge.name asc
    )::bigint as board_rank
  from group_eliminated ge
),
peoples_champion_rows as (
  select
    gr.id,
    gr.name,
    gr.fifa_code,
    gr.group_letter,
    gr.global_fifa_rank,
    gr.tournament_rank,
    gr.group_position,
    row_number() over (
      order by gr.global_fifa_rank desc nulls last, gr.name asc
    )::bigint as board_rank
  from group_ranked gr
  where gr.id in (select id from qualifiers)
)
insert into public.frozen_group_stage_award_board (
  board,
  team_id,
  team_name,
  fifa_code,
  tournament_stage,
  global_fifa_rank,
  tournament_rank,
  group_letter,
  group_position,
  board_rank,
  frozen_at
)
select
  'wooden_spoon',
  id,
  name,
  fifa_code,
  'eliminated'::public.tournament_stage,
  global_fifa_rank,
  tournament_rank,
  group_letter,
  group_position,
  board_rank,
  '2026-06-29 00:00:00+00'::timestamptz
from wooden_spoon_rows
union all
select
  'peoples_champion',
  id,
  name,
  fifa_code,
  'round_of_32'::public.tournament_stage,
  global_fifa_rank,
  tournament_rank,
  group_letter,
  group_position,
  board_rank,
  '2026-06-29 00:00:00+00'::timestamptz
from peoples_champion_rows;

drop view if exists public.leaderboard_wooden_spoon;
drop view if exists public.leaderboard_peoples_champion;
drop view if exists public.board_group_eliminations;
drop view if exists public.board_knockout_qualifiers;

create view public.leaderboard_wooden_spoon as
select
  pm.pool_id,
  f.team_id,
  f.team_name,
  f.fifa_code,
  f.tournament_stage,
  f.global_fifa_rank,
  f.group_letter,
  f.group_position,
  array_agg(pm.display_name order by pm.join_order) as manager_names,
  array_agg(pm.id order by pm.join_order) as pool_member_ids,
  count(pm.id)::int as co_manager_count,
  f.board_rank::bigint as spoon_rank
from public.pool_members pm
join public.frozen_group_stage_award_board f on f.team_id = pm.assigned_team_id
where f.board = 'wooden_spoon'
group by pm.pool_id, f.team_id, f.team_name, f.fifa_code, f.tournament_stage,
         f.global_fifa_rank, f.group_letter, f.group_position, f.board_rank;

create view public.leaderboard_peoples_champion as
select
  pm.pool_id,
  f.team_id,
  f.team_name,
  f.fifa_code,
  f.tournament_stage,
  f.global_fifa_rank,
  f.group_letter,
  f.group_position,
  array_agg(pm.display_name order by pm.join_order) as manager_names,
  array_agg(pm.id order by pm.join_order) as pool_member_ids,
  count(pm.id)::int as co_manager_count,
  f.board_rank::bigint as champion_rank
from public.pool_members pm
join public.frozen_group_stage_award_board f on f.team_id = pm.assigned_team_id
where f.board = 'peoples_champion'
group by pm.pool_id, f.team_id, f.team_name, f.fifa_code, f.tournament_stage,
         f.global_fifa_rank, f.group_letter, f.group_position, f.board_rank;

create view public.board_group_eliminations as
select
  f.team_id,
  f.team_name,
  f.fifa_code,
  f.tournament_stage,
  f.global_fifa_rank,
  f.tournament_rank,
  f.group_letter,
  f.group_position
from public.frozen_group_stage_award_board f
where f.board = 'wooden_spoon'
order by f.board_rank;

create view public.board_knockout_qualifiers as
select
  f.team_id,
  f.team_name,
  f.fifa_code,
  f.tournament_stage,
  f.global_fifa_rank,
  f.tournament_rank
from public.frozen_group_stage_award_board f
where f.board = 'peoples_champion'
order by f.board_rank;

grant select on public.frozen_group_stage_award_board to authenticated;
grant select on public.leaderboard_wooden_spoon to authenticated;
grant select on public.leaderboard_peoples_champion to authenticated;
grant select on public.board_group_eliminations to authenticated;
grant select on public.board_knockout_qualifiers to authenticated;
