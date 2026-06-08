-- Expose global FIFA rank on pool leaderboard views.
-- New columns must be appended at the end: CREATE OR REPLACE VIEW cannot insert columns mid-list.

create or replace view public.leaderboard_tournament_standing as
select
  pm.pool_id,
  t.id as team_id,
  t.name as team_name,
  t.fifa_code,
  t.tournament_stage,
  t.tournament_rank,
  t.group_letter,
  t.group_position,
  t.group_points,
  t.group_goal_difference,
  array_agg(pm.display_name order by pm.join_order) as manager_names,
  array_agg(pm.id order by pm.join_order) as pool_member_ids,
  count(pm.id)::int as co_manager_count,
  t.global_fifa_rank
from public.pool_members pm
join public.teams t on t.id = pm.assigned_team_id
group by pm.pool_id, t.id, t.name, t.fifa_code, t.tournament_stage, t.tournament_rank,
         t.group_letter, t.group_position, t.group_points, t.group_goal_difference,
         t.global_fifa_rank;

create or replace view public.leaderboard_odds_points as
select
  pm.pool_id,
  pm.id as pool_member_id,
  pm.user_id,
  pm.display_name,
  pm.assigned_team_id,
  t.name as team_name,
  t.fifa_code,
  coalesce(sum(mmp.points), 0)::numeric(10, 2) as total_points,
  count(mmp.id)::int as wins_scored,
  t.global_fifa_rank
from public.pool_members pm
left join public.teams t on t.id = pm.assigned_team_id
left join public.member_match_points mmp on mmp.pool_member_id = pm.id
group by pm.pool_id, pm.id, pm.user_id, pm.display_name, pm.assigned_team_id, t.name, t.fifa_code,
         t.global_fifa_rank;
