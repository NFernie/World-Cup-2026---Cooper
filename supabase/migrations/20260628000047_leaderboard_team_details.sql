-- Pool leaderboards: nation, group, managers, FIFA rank (match overall leaderboard).

create or replace view public.leaderboard_golden_boot as
select
  pm.pool_id,
  t.id as team_id,
  t.name as team_name,
  t.fifa_code,
  t.golden_boot_player_name,
  t.golden_boot_goals,
  t.global_fifa_rank,
  array_agg(pm.id order by pm.join_order) as pool_member_ids,
  rank() over (
    partition by pm.pool_id
    order by t.golden_boot_goals desc, t.global_fifa_rank asc nulls last, t.name
  ) as boot_rank,
  t.group_letter,
  t.group_position,
  array_agg(pm.display_name order by pm.join_order) as manager_names,
  count(pm.id)::int as co_manager_count
from public.pool_members pm
join public.teams t on t.id = pm.assigned_team_id
where t.golden_boot_player_name is not null
group by pm.pool_id, t.id, t.name, t.fifa_code, t.golden_boot_player_name,
         t.golden_boot_goals, t.global_fifa_rank, t.group_letter, t.group_position;

create or replace view public.leaderboard_golden_glove as
select
  pm.pool_id,
  t.id as team_id,
  t.name as team_name,
  t.fifa_code,
  t.golden_glove_player_name,
  t.golden_glove_clean_sheets,
  t.global_fifa_rank,
  array_agg(pm.id order by pm.join_order) as pool_member_ids,
  rank() over (
    partition by pm.pool_id
    order by t.golden_glove_clean_sheets desc, t.global_fifa_rank asc nulls last, t.name
  ) as glove_rank,
  t.group_letter,
  t.group_position,
  array_agg(pm.display_name order by pm.join_order) as manager_names,
  count(pm.id)::int as co_manager_count
from public.pool_members pm
join public.teams t on t.id = pm.assigned_team_id
where t.golden_glove_player_name is not null
group by pm.pool_id, t.id, t.name, t.fifa_code, t.golden_glove_player_name,
         t.golden_glove_clean_sheets, t.global_fifa_rank, t.group_letter, t.group_position;

create or replace view public.leaderboard_wooden_spoon as
select
  pm.pool_id,
  t.id as team_id,
  t.name as team_name,
  t.fifa_code,
  t.tournament_stage,
  t.global_fifa_rank,
  t.group_letter,
  t.group_position,
  array_agg(pm.display_name order by pm.join_order) as manager_names,
  array_agg(pm.id order by pm.join_order) as pool_member_ids,
  count(pm.id)::int as co_manager_count,
  rank() over (
    partition by pm.pool_id
    order by t.global_fifa_rank asc nulls last, t.name
  ) as spoon_rank
from public.pool_members pm
join public.teams t on t.id = pm.assigned_team_id
where t.tournament_stage = 'eliminated'
group by pm.pool_id, t.id, t.name, t.fifa_code, t.tournament_stage,
         t.global_fifa_rank, t.group_letter, t.group_position;

create or replace view public.leaderboard_peoples_champion as
select
  pm.pool_id,
  t.id as team_id,
  t.name as team_name,
  t.fifa_code,
  t.tournament_stage,
  t.global_fifa_rank,
  t.group_letter,
  t.group_position,
  array_agg(pm.display_name order by pm.join_order) as manager_names,
  array_agg(pm.id order by pm.join_order) as pool_member_ids,
  count(pm.id)::int as co_manager_count,
  rank() over (
    partition by pm.pool_id
    order by t.global_fifa_rank desc nulls last, t.name
  ) as champion_rank
from public.pool_members pm
join public.teams t on t.id = pm.assigned_team_id
where t.tournament_stage in (
  'round_of_32', 'round_of_16', 'quarter_final', 'semi_final',
  'third_place', 'final', 'winner', 'runner_up'
)
group by pm.pool_id, t.id, t.name, t.fifa_code, t.tournament_stage,
         t.global_fifa_rank, t.group_letter, t.group_position;

grant select on public.leaderboard_wooden_spoon to authenticated;
grant select on public.leaderboard_peoples_champion to authenticated;
