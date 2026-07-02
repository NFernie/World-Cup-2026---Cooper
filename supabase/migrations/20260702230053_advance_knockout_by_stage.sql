-- Advance knockout winners by match stage when FIFA match_number is missing (France/England/Spain).

create or replace function public.knockout_winner_stage_for_match(
  p_match_number int,
  p_stage public.tournament_stage
)
returns public.tournament_stage
language sql
immutable
as $$
  select coalesce(
    case
      when p_match_number between 73 and 88 then 'round_of_16'::public.tournament_stage
      when p_match_number between 89 and 96 then 'quarter_final'::public.tournament_stage
      when p_match_number between 97 and 100 then 'semi_final'::public.tournament_stage
      when p_match_number in (101, 102) then 'final'::public.tournament_stage
      else null
    end,
    case p_stage
      when 'round_of_32' then 'round_of_16'::public.tournament_stage
      when 'round_of_16' then 'quarter_final'::public.tournament_stage
      when 'quarter_final' then 'semi_final'::public.tournament_stage
      when 'semi_final' then 'final'::public.tournament_stage
      else null
    end
  );
$$;

create or replace function public.knockout_loser_exit_for_match(
  p_match_number int,
  p_stage public.tournament_stage
)
returns public.tournament_stage
language sql
immutable
as $$
  select coalesce(
    public.knockout_exit_stage_for_match(p_match_number),
    case p_stage
      when 'round_of_32' then 'round_of_32'::public.tournament_stage
      when 'round_of_16' then 'round_of_16'::public.tournament_stage
      when 'quarter_final' then 'quarter_final'::public.tournament_stage
      when 'semi_final' then 'semi_final'::public.tournament_stage
      when 'third_place' then 'semi_final'::public.tournament_stage
      else 'group'::public.tournament_stage
    end
  );
$$;

create or replace function public.backfill_knockout_match_winners()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assign_knockout_match_numbers();

  -- Normal-time results missing winner_team_id.
  update public.matches m
  set winner_team_id = public.knockout_match_winner_id(
    m.home_team_id,
    m.away_team_id,
    m.home_score,
    m.away_score,
    m.winner_team_id
  )
  where m.stage <> 'group'
    and m.status = 'finished'
    and m.winner_team_id is null
    and m.home_score is not null
    and m.away_score is not null
    and m.home_score is distinct from m.away_score;

  -- Winner already placed in a later-round fixture (feeder match_number known).
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

  -- Winner in a later-round fixture when feeder match_number is unknown.
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
          from public.matches nxt
          where nxt.stage in (
            'round_of_16'::public.tournament_stage,
            'quarter_final'::public.tournament_stage,
            'semi_final'::public.tournament_stage,
            'final'::public.tournament_stage
          )
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
      and m.match_number is null
      and m.winner_team_id is null
  ) inferred
  where feeder.id = inferred.feeder_id
    and inferred.winner_id is not null;
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

  -- Finished cross-group matches mislabeled as group that match an R32 slot pairing.
  update public.matches m
  set stage = 'round_of_32'
  from public.teams th, public.teams ta
  where th.id = m.home_team_id
    and ta.id = m.away_team_id
    and m.stage = 'group'
    and m.status = 'finished'
    and m.home_score is not null
    and m.away_score is not null
    and th.group_letter is not null
    and ta.group_letter is not null
    and th.group_letter <> ta.group_letter
    and exists (
      select 1
      from (
        values
          ('2A', '2B'),
          ('1E', '3D'),
          ('1F', '2C'),
          ('1C', '2F'),
          ('1I', '3F'),
          ('2E', '2I'),
          ('1A', '3E'),
          ('1L', '3K'),
          ('1D', '3B'),
          ('1G', '3I'),
          ('2K', '2L'),
          ('1H', '2J'),
          ('1B', '3J'),
          ('1J', '2H'),
          ('1K', '3L'),
          ('2D', '2G')
      ) as p(slot_home, slot_away)
      where (
        public.team_slot_code(th.group_letter, th.group_position) = p.slot_home
        and public.team_slot_code(ta.group_letter, ta.group_position) = p.slot_away
      ) or (
        public.team_slot_code(th.group_letter, th.group_position) = p.slot_away
        and public.team_slot_code(ta.group_letter, ta.group_position) = p.slot_home
      )
    );

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
      and (p_match_id is null or m.id = p_match_id)
    order by
      case m.stage
        when 'round_of_32' then 1
        when 'round_of_16' then 2
        when 'quarter_final' then 3
        when 'semi_final' then 4
        when 'third_place' then 5
        when 'final' then 6
        else 7
      end,
      coalesce(m.match_number, 999),
      m.kickoff_at
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

    loser_exit := public.knockout_loser_exit_for_match(rec.match_number, rec.stage);
    winner_stage := public.knockout_winner_stage_for_match(rec.match_number, rec.stage);

    if rec.match_number = 104 or rec.stage = 'final' then
      update public.teams set tournament_stage = 'winner', knockout_exit_stage = null where id = winner;
      update public.teams
      set tournament_stage = 'runner_up', knockout_exit_stage = 'final'
      where id = loser;
      continue;
    end if;

    if rec.match_number = 103 or rec.stage = 'third_place' then
      update public.teams
      set tournament_stage = 'eliminated', knockout_exit_stage = loser_exit
      where id = loser;
      continue;
    end if;

    if winner_stage is not null then
      update public.teams
      set tournament_stage = winner_stage, knockout_exit_stage = null
      where id = winner;
    end if;

    if rec.stage not in ('semi_final', 'final') and rec.match_number not in (101, 102) then
      update public.teams
      set tournament_stage = 'eliminated', knockout_exit_stage = loser_exit
      where id = loser;
    end if;

    if rec.match_number is null then
      continue;
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

  -- Teams already placed in later-round fixtures (e.g. API synced R16 slot).
  update public.teams t
  set tournament_stage = 'round_of_16', knockout_exit_stage = null
  where t.tournament_stage = 'round_of_32'
    and exists (
      select 1
      from public.matches m
      where m.stage = 'round_of_16'
        and (m.home_team_id = t.id or m.away_team_id = t.id)
    );

  update public.teams t
  set tournament_stage = 'quarter_final', knockout_exit_stage = null
  where t.tournament_stage in ('round_of_32', 'round_of_16')
    and exists (
      select 1
      from public.matches m
      where m.stage = 'quarter_final'
        and (m.home_team_id = t.id or m.away_team_id = t.id)
    );

  update public.teams t
  set tournament_stage = 'semi_final', knockout_exit_stage = null
  where t.tournament_stage in ('round_of_32', 'round_of_16', 'quarter_final')
    and exists (
      select 1
      from public.matches m
      where m.stage = 'semi_final'
        and (m.home_team_id = t.id or m.away_team_id = t.id)
    );

  update public.teams t
  set tournament_stage = 'final', knockout_exit_stage = null
  where t.tournament_stage not in ('winner', 'runner_up', 'eliminated', 'final')
    and exists (
      select 1
      from public.matches m
      where m.stage = 'final'
        and (m.home_team_id = t.id or m.away_team_id = t.id)
    );

  perform public.recalculate_tournament_progress_rank();
end;
$$;

select public.backfill_knockout_match_winners();
select public.advance_knockout_winners();
