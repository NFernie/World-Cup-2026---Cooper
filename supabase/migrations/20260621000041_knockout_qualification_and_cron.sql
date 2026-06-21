-- Update knockout qualification on standings recalc; poll match results every minute.

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

  -- Reset knockout flags; re-apply from current group results.
  update public.teams
  set tournament_stage = 'group'
  where tournament_stage in ('round_of_32', 'eliminated');

  with group_sizes as (
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
  )
  update public.teams t
  set tournament_stage = case
    when t.group_position <= 2 then 'round_of_32'::public.tournament_stage
    else 'eliminated'::public.tournament_stage
  end
  from complete_groups cg
  where t.group_letter = cg.group_letter
    and t.group_position is not null;

  -- Mid-group clinch (e.g. two wins = 6 pts in a four-team group).
  update public.teams t
  set tournament_stage = 'round_of_32'
  where t.group_letter is not null
    and t.group_position is not null
    and t.group_position <= 2
    and t.group_points >= 6
    and t.tournament_stage = 'group';
end;
$$;

select public.recalculate_group_standings();

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'wc26-sync-match-results') then
    perform cron.unschedule('wc26-sync-match-results');
  end if;
  if exists (select 1 from cron.job where jobname = 'wc26-sync-match-results-live') then
    perform cron.unschedule('wc26-sync-match-results-live');
  end if;
end $do$;

select cron.schedule(
  'wc26-sync-match-results',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-match-results',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);

select cron.schedule(
  'wc26-sync-match-results-live',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-match-results',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode":"live"}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
