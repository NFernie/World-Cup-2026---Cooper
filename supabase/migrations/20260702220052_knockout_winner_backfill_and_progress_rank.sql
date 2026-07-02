-- Backfill R32 winners (penalty ties / missing winner_team_id), track exit round, rank by progress.

alter table public.teams
  add column if not exists knockout_exit_stage public.tournament_stage;

create or replace function public.tournament_stage_rank_key(
  p_stage public.tournament_stage,
  p_exit_stage public.tournament_stage
)
returns int
language sql
immutable
as $$
  select case
    when p_stage = 'winner' then 1000
    when p_stage = 'runner_up' then 990
    when p_stage = 'final' then 980
    when p_stage = 'semi_final' then 970
    when p_stage = 'quarter_final' then 960
    when p_stage = 'round_of_16' then 950
    when p_stage = 'round_of_32' then 940
    when p_stage = 'third_place' then 930
    when p_stage = 'eliminated' then
      case coalesce(p_exit_stage, 'group'::public.tournament_stage)
        when 'semi_final' then 920
        when 'quarter_final' then 910
        when 'round_of_16' then 900
        when 'round_of_32' then 890
        else 100
      end
    when p_stage = 'group' then 50
    else 0
  end;
$$;

create or replace function public.knockout_exit_stage_for_match(p_match_number int)
returns public.tournament_stage
language sql
immutable
as $$
  select case
    when p_match_number between 73 and 88 then 'round_of_32'::public.tournament_stage
    when p_match_number between 89 and 96 then 'round_of_16'::public.tournament_stage
    when p_match_number between 97 and 100 then 'quarter_final'::public.tournament_stage
    when p_match_number in (101, 102) then 'semi_final'::public.tournament_stage
    when p_match_number = 103 then 'semi_final'::public.tournament_stage
    else null
  end;
$$;

create or replace function public.recalculate_tournament_progress_rank()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with team_stats as (
    select
      t.id,
      t.name,
      t.tournament_stage,
      t.knockout_exit_stage,
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
        order by
          public.tournament_stage_rank_key(tournament_stage, knockout_exit_stage) desc,
          group_points desc,
          group_goal_difference desc,
          goals_for desc,
          name asc
      )::int as trank
    from team_stats
  )
  update public.teams t
  set tournament_rank = gr.trank
  from global_ranked gr
  where t.id = gr.id;
end;
$$;

-- Infer winner_team_id when API left a draw but the winner is already in the next-round fixture.
create or replace function public.backfill_knockout_match_winners()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assign_knockout_match_numbers();

  update public.matches feeder
  set winner_team_id = inferred.winner_id
  from (
    select
      m.id as feeder_id,
      (
        select candidate_id
        from unnest(array[m.home_team_id, m.away_team_id]) as candidate_id
        where exists (
          select 1
          from public.fifa_bracket_feeds bf
          join public.matches nxt on nxt.match_number = bf.target_match
          where bf.feeder_match = m.match_number
            and bf.target_match <> 103
            and candidate_id in (nxt.home_team_id, nxt.away_team_id)
            and not exists (
              select 1
              from unnest(array[m.home_team_id, m.away_team_id]) as other_id
              where other_id <> candidate_id
                and other_id in (nxt.home_team_id, nxt.away_team_id)
            )
        )
        limit 1
      ) as winner_id
    from public.matches m
    where m.stage <> 'group'
      and m.status = 'finished'
      and m.home_score is not null
      and m.away_score is not null
      and m.match_number is not null
      and m.winner_team_id is null
  ) inferred
  where feeder.id = inferred.feeder_id
    and inferred.winner_id is not null;
end;
$$;

create or replace function public.assign_knockout_match_numbers()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  home_slot text;
  away_slot text;
begin
  for rec in
    select
      m.id,
      public.team_slot_code(th.group_letter, th.group_position) as home_slot,
      public.team_slot_code(ta.group_letter, ta.group_position) as away_slot
    from public.matches m
    join public.teams th on th.id = m.home_team_id
    join public.teams ta on ta.id = m.away_team_id
    where m.match_number is null
      and m.stage <> 'group'
  loop
    home_slot := rec.home_slot;
    away_slot := rec.away_slot;

    update public.matches m
    set match_number = p.match_number
    from (
      values
        (73, '2A', '2B'),
        (74, '1E', '3D'),
        (75, '1F', '2C'),
        (76, '1C', '2F'),
        (77, '1I', '3F'),
        (78, '2E', '2I'),
        (79, '1A', '3E'),
        (80, '1L', '3K'),
        (81, '1D', '3B'),
        (82, '1G', '3I'),
        (83, '2K', '2L'),
        (84, '1H', '2J'),
        (85, '1B', '3J'),
        (86, '1J', '2H'),
        (87, '1K', '3L'),
        (88, '2D', '2G')
    ) as p(match_number, slot_home, slot_away)
    where m.id = rec.id
      and home_slot is not null
      and away_slot is not null
      and (
        (home_slot = p.slot_home and away_slot = p.slot_away)
        or (home_slot = p.slot_away and away_slot = p.slot_home)
      );
  end loop;

  for rec in
    select distinct bf.target_match
    from public.fifa_bracket_feeds bf
    order by bf.target_match
  loop
    update public.matches m
    set match_number = rec.target_match
    where m.id = (
      select candidate.id
      from public.matches candidate
      where candidate.match_number is null
        and candidate.stage = case
          when rec.target_match between 89 and 96 then 'round_of_16'::public.tournament_stage
          when rec.target_match between 97 and 100 then 'quarter_final'::public.tournament_stage
          when rec.target_match in (101, 102) then 'semi_final'::public.tournament_stage
          when rec.target_match = 103 then 'third_place'::public.tournament_stage
          when rec.target_match = 104 then 'final'::public.tournament_stage
          else candidate.stage
        end
        and (
          select count(*)
          from public.fifa_bracket_feeds bf3
          join public.matches feeder on feeder.match_number = bf3.feeder_match
          where bf3.target_match = rec.target_match
            and feeder.status = 'finished'
            and public.knockout_match_winner_id(
              feeder.home_team_id,
              feeder.away_team_id,
              feeder.home_score,
              feeder.away_score,
              feeder.winner_team_id
            ) in (candidate.home_team_id, candidate.away_team_id)
        ) >= 1
      order by (
        select count(*)
        from public.fifa_bracket_feeds bf4
        join public.matches feeder2 on feeder2.match_number = bf4.feeder_match
        where bf4.target_match = rec.target_match
          and feeder2.status = 'finished'
          and public.knockout_match_winner_id(
            feeder2.home_team_id,
            feeder2.away_team_id,
            feeder2.home_score,
            feeder2.away_score,
            feeder2.winner_team_id
          ) in (candidate.home_team_id, candidate.away_team_id)
      ) desc,
      candidate.kickoff_at asc
      limit 1
    );
  end loop;
end;
$$;

create or replace function public.advance_knockout_winners(p_match_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  feed record;
  winner uuid;
  loser uuid;
  winner_stage public.tournament_stage;
  loser_exit public.tournament_stage;
begin
  perform public.backfill_knockout_match_winners();

  for rec in
    select
      m.id,
      m.match_number,
      m.stage,
      m.home_team_id,
      m.away_team_id,
      m.home_score,
      m.away_score,
      m.winner_team_id
    from public.matches m
    where m.stage <> 'group'
      and m.status = 'finished'
      and m.home_score is not null
      and m.away_score is not null
      and m.match_number is not null
      and (p_match_id is null or m.id = p_match_id)
    order by m.match_number
  loop
    winner := public.knockout_match_winner_id(
      rec.home_team_id,
      rec.away_team_id,
      rec.home_score,
      rec.away_score,
      rec.winner_team_id
    );
    if winner is null then
      continue;
    end if;

    loser := case
      when winner = rec.home_team_id then rec.away_team_id
      else rec.home_team_id
    end;

    loser_exit := public.knockout_exit_stage_for_match(rec.match_number);

    if rec.match_number = 104 then
      update public.teams set tournament_stage = 'winner', knockout_exit_stage = null where id = winner;
      update public.teams
      set tournament_stage = 'runner_up', knockout_exit_stage = 'final'
      where id = loser;
      continue;
    end if;

    if rec.match_number = 103 then
      update public.teams
      set tournament_stage = 'eliminated', knockout_exit_stage = loser_exit
      where id = loser;
      continue;
    end if;

    winner_stage := case
      when rec.match_number between 73 and 88 then 'round_of_16'::public.tournament_stage
      when rec.match_number between 89 and 96 then 'quarter_final'::public.tournament_stage
      when rec.match_number between 97 and 100 then 'semi_final'::public.tournament_stage
      when rec.match_number in (101, 102) then 'final'::public.tournament_stage
      else null
    end;

    if winner_stage is not null then
      update public.teams
      set tournament_stage = winner_stage, knockout_exit_stage = null
      where id = winner;
    end if;

    if rec.match_number not in (101, 102) then
      update public.teams
      set tournament_stage = 'eliminated', knockout_exit_stage = loser_exit
      where id = loser;
    end if;

    for feed in
      select bf.target_match, bf.target_slot
      from public.fifa_bracket_feeds bf
      where bf.feeder_match = rec.match_number
        and bf.target_match <> 103
    loop
      if feed.target_slot = 'home' then
        update public.matches
        set
          home_team_id = winner,
          match_number = coalesce(public.matches.match_number, feed.target_match)
        where public.matches.match_number = feed.target_match
          and home_team_id is distinct from winner;
      else
        update public.matches
        set
          away_team_id = winner,
          match_number = coalesce(public.matches.match_number, feed.target_match)
        where public.matches.match_number = feed.target_match
          and away_team_id is distinct from winner;
      end if;
    end loop;

    if rec.match_number in (101, 102) then
      for feed in
        select bf.target_match, bf.target_slot
        from public.fifa_bracket_feeds bf
        where bf.feeder_match = rec.match_number
          and bf.target_match = 103
      loop
        if feed.target_slot = 'home' then
          update public.matches
          set
            home_team_id = loser,
            match_number = coalesce(public.matches.match_number, feed.target_match)
          where public.matches.match_number = feed.target_match
            and home_team_id is distinct from loser;
        else
          update public.matches
          set
            away_team_id = loser,
            match_number = coalesce(public.matches.match_number, feed.target_match)
          where public.matches.match_number = feed.target_match
            and away_team_id is distinct from loser;
        end if;
      end loop;
    end if;
  end loop;

  perform public.recalculate_tournament_progress_rank();
end;
$$;

grant execute on function public.recalculate_tournament_progress_rank() to authenticated;
grant execute on function public.recalculate_tournament_progress_rank() to service_role;
grant execute on function public.backfill_knockout_match_winners() to authenticated;
grant execute on function public.backfill_knockout_match_winners() to service_role;

-- Replace group-only tournament_rank with progress-based ranking in recalculate_group_standings.
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
  set
    tournament_stage = case
      when t.group_position <= 2 then 'round_of_32'::public.tournament_stage
      else 'eliminated'::public.tournament_stage
    end,
    knockout_exit_stage = case
      when t.group_position <= 2 then null
      else 'group'::public.tournament_stage
    end
  from complete_groups cg
  where t.group_letter = cg.group_letter
    and t.group_position is not null
    and t.tournament_stage in ('group', 'round_of_32', 'eliminated');

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
  set tournament_stage = 'round_of_32', knockout_exit_stage = null
  from ranked_thirds r
  cross join group_count gc
  where t.id = r.id
    and r.third_rank <= 8
    and (select count(*)::int from complete_groups) = gc.total
    and t.tournament_stage in ('group', 'round_of_32', 'eliminated');

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
      if t_rec.tournament_stage not in ('group', 'eliminated') then
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
        set tournament_stage = 'round_of_32', knockout_exit_stage = null
        where id = t_rec.id
          and tournament_stage in ('group', 'eliminated');
      elsif blockers >= 2 then
        update public.teams
        set tournament_stage = 'eliminated', knockout_exit_stage = 'group'
        where id = t_rec.id
          and tournament_stage in ('group', 'eliminated');
      end if;
    end loop;
  end loop;

  perform public.advance_knockout_winners();
end;
$$;

select public.backfill_knockout_match_winners();
select public.advance_knockout_winners();
select public.recalculate_tournament_progress_rank();
