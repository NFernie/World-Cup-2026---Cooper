-- Recompute group standings from finished group-stage matches and run match-results sync every 2 min.

create or replace function public.recalculate_group_standings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.teams
  set
    group_points = 0,
    group_goal_difference = 0,
    group_position = null,
    tournament_rank = null;

  with match_results as (
    select
      m.home_team_id as team_id,
      m.home_score as goals_for,
      m.away_score as goals_against,
      case
        when m.home_score > m.away_score then 3
        when m.home_score = m.away_score then 1
        else 0
      end as points
    from public.matches m
    where m.stage = 'group'
      and m.status = 'finished'
      and m.home_score is not null
      and m.away_score is not null
    union all
    select
      m.away_team_id,
      m.away_score,
      m.home_score,
      case
        when m.away_score > m.home_score then 3
        when m.away_score = m.home_score then 1
        else 0
      end
    from public.matches m
    where m.stage = 'group'
      and m.status = 'finished'
      and m.home_score is not null
      and m.away_score is not null
  ),
  aggregates as (
    select
      team_id,
      sum(points)::int as points,
      sum(goals_for - goals_against)::int as goal_difference,
      sum(goals_for)::int as goals_for
    from match_results
    group by team_id
  )
  update public.teams t
  set
    group_points = coalesce(a.points, 0),
    group_goal_difference = coalesce(a.goal_difference, 0)
  from aggregates a
  where t.id = a.team_id;

  with team_stats as (
    select
      t.id,
      t.group_letter,
      t.name,
      t.group_points,
      t.group_goal_difference,
      coalesce((
        select sum(
          case
            when m.home_team_id = t.id then m.home_score
            when m.away_team_id = t.id then m.away_score
          end
        )::int
        from public.matches m
        where m.stage = 'group'
          and m.status = 'finished'
          and m.home_score is not null
          and m.away_score is not null
          and (m.home_team_id = t.id or m.away_team_id = t.id)
      ), 0) as goals_for
    from public.teams t
    where t.group_letter is not null
  ),
  group_ranked as (
    select
      id,
      row_number() over (
        partition by group_letter
        order by group_points desc, group_goal_difference desc, goals_for desc, name asc
      )::int as pos
    from team_stats
  )
  update public.teams t
  set group_position = gr.pos
  from group_ranked gr
  where t.id = gr.id;

  with team_stats as (
    select
      t.id,
      t.name,
      t.group_points,
      t.group_goal_difference,
      coalesce((
        select sum(
          case
            when m.home_team_id = t.id then m.home_score
            when m.away_team_id = t.id then m.away_score
          end
        )::int
        from public.matches m
        where m.stage = 'group'
          and m.status = 'finished'
          and m.home_score is not null
          and m.away_score is not null
          and (m.home_team_id = t.id or m.away_team_id = t.id)
      ), 0) as goals_for
    from public.teams t
  ),
  global_ranked as (
    select
      id,
      row_number() over (
        order by group_points desc, group_goal_difference desc, goals_for desc, name asc
      )::int as trank
    from team_stats
  )
  update public.teams t
  set tournament_rank = gr.trank
  from global_ranked gr
  where t.id = gr.id;
end;
$$;

grant execute on function public.recalculate_group_standings() to authenticated;
grant execute on function public.recalculate_group_standings() to service_role;

select public.recalculate_group_standings();

-- Push team standing updates to connected clients.
do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'teams'
  ) then
    alter publication supabase_realtime add table public.teams;
  end if;
end $do$;

-- Main match-results sync: every 2 minutes (was */5).
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'wc26-sync-match-results') then
    perform cron.unschedule('wc26-sync-match-results');
  end if;
end $do$;

select cron.schedule(
  'wc26-sync-match-results',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-match-results',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
