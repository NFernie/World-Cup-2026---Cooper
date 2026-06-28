-- Finalize R32 qualification: top two per group + 8 best third-placed teams; backfill leaderboards.

create or replace function public.recalculate_group_standings()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g_letter char(1);
  t_rec record;
  u_rec record;
  our_rem int;
  our_max int;
  our_gf int;
  rival_rem int;
  rival_max int;
  rival_gf int;
  blockers int;
  rivals_can_pass int;
  group_complete boolean;
  expected_played int;
  actual_played int;
  team_count int;
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

  -- Best 8 third-placed teams advance when every group is complete (32-team knockout).
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
  ),
  group_count as (
    select count(distinct group_letter)::int as total
    from public.teams
    where group_letter is not null
  ),
  third_placed as (
    select
      t.id,
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
      ), 0) as goals_for,
      t.name
    from public.teams t
    inner join complete_groups cg on cg.group_letter = t.group_letter
    where t.group_position = 3
  ),
  ranked_thirds as (
    select
      id,
      row_number() over (
        order by group_points desc, group_goal_difference desc, goals_for desc, name asc
      )::int as third_rank
    from third_placed
  )
  update public.teams t
  set tournament_stage = 'round_of_32'
  from ranked_thirds r
  cross join group_count gc
  where t.id = r.id
    and r.third_rank <= 8
    and (select count(*)::int from complete_groups) = gc.total;

  -- Mid-group clinch + elimination for incomplete groups.
  for g_letter in
    select distinct t.group_letter
    from public.teams t
    where t.group_letter is not null
  loop
    select count(*)::int into team_count
    from public.teams
    where group_letter = g_letter;

    expected_played := team_count * (team_count - 1) / 2;

    select count(*)::int into actual_played
    from public.matches m
    join public.teams th on th.id = m.home_team_id
    join public.teams ta on ta.id = m.away_team_id
    where m.stage = 'group'
      and m.status = 'finished'
      and m.home_score is not null
      and m.away_score is not null
      and th.group_letter = g_letter
      and ta.group_letter = g_letter;

    group_complete := actual_played >= expected_played;
    if group_complete then
      continue;
    end if;

    for t_rec in
      select
        t.id,
        t.name,
        t.group_points,
        t.group_goal_difference,
        t.group_position,
        t.tournament_stage,
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
      where t.group_letter = g_letter
    loop
      if t_rec.tournament_stage = 'round_of_32' then
        continue;
      end if;

      select count(*)::int into our_rem
      from public.matches m
      join public.teams th on th.id = m.home_team_id
      join public.teams ta on ta.id = m.away_team_id
      where m.stage = 'group'
        and m.status <> 'finished'
        and th.group_letter = g_letter
        and ta.group_letter = g_letter
        and (m.home_team_id = t_rec.id or m.away_team_id = t_rec.id);

      our_max := t_rec.group_points + 3 * our_rem;
      our_gf := t_rec.goals_for;
      blockers := 0;
      rivals_can_pass := 0;

      for u_rec in
        select
          u.id,
          u.name,
          u.group_points,
          u.group_goal_difference,
          coalesce((
            select sum(
              case
                when m.home_team_id = u.id then m.home_score
                when m.away_team_id = u.id then m.away_score
              end
            )::int
            from public.matches m
            where m.stage = 'group'
              and m.status = 'finished'
              and m.home_score is not null
              and m.away_score is not null
              and (m.home_team_id = u.id or m.away_team_id = u.id)
          ), 0) as goals_for
        from public.teams u
        where u.group_letter = g_letter
          and u.id <> t_rec.id
      loop
        select count(*)::int into rival_rem
        from public.matches m
        join public.teams th on th.id = m.home_team_id
        join public.teams ta on ta.id = m.away_team_id
        where m.stage = 'group'
          and m.status <> 'finished'
          and th.group_letter = g_letter
          and ta.group_letter = g_letter
          and (m.home_team_id = u_rec.id or m.away_team_id = u_rec.id);

        rival_max := u_rec.group_points + 3 * rival_rem;
        rival_gf := u_rec.goals_for;

        if rival_max > t_rec.group_points then
          rivals_can_pass := rivals_can_pass + 1;
        elsif rival_max = t_rec.group_points and (
          u_rec.group_goal_difference > t_rec.group_goal_difference
          or (
            u_rec.group_goal_difference = t_rec.group_goal_difference
            and rival_gf > our_gf
          )
          or (
            u_rec.group_goal_difference = t_rec.group_goal_difference
            and rival_gf = our_gf
            and u_rec.name < t_rec.name
          )
        ) then
          rivals_can_pass := rivals_can_pass + 1;
        end if;

        if u_rec.group_points > our_max then
          blockers := blockers + 1;
        elsif rival_max > our_max then
          blockers := blockers + 1;
        elsif rival_max = our_max and (
          u_rec.group_goal_difference > t_rec.group_goal_difference
          or (
            u_rec.group_goal_difference = t_rec.group_goal_difference
            and rival_gf > our_gf
          )
          or (
            u_rec.group_goal_difference = t_rec.group_goal_difference
            and rival_gf = our_gf
            and u_rec.name < t_rec.name
          )
        ) then
          blockers := blockers + 1;
        end if;
      end loop;

      if t_rec.group_position is not null
        and t_rec.group_position <= 2
        and rivals_can_pass < 2 then
        update public.teams
        set tournament_stage = 'round_of_32'
        where id = t_rec.id;
      elsif blockers >= 2 then
        update public.teams
        set tournament_stage = 'eliminated'
        where id = t_rec.id;
      end if;
    end loop;
  end loop;
end;
$$;

select public.recalculate_group_standings();
