-- FIFA match numbers (M73–M104) and official bracket advancement (not kickoff order).

alter table public.matches
  add column if not exists match_number int;

create index if not exists matches_match_number_idx on public.matches (match_number);

create table if not exists public.fifa_bracket_feeds (
  feeder_match int not null,
  target_match int not null,
  target_slot text not null check (target_slot in ('home', 'away')),
  primary key (feeder_match, target_match, target_slot)
);

truncate public.fifa_bracket_feeds;

insert into public.fifa_bracket_feeds (feeder_match, target_match, target_slot) values
  (74, 89, 'home'), (77, 89, 'away'),
  (73, 90, 'home'), (75, 90, 'away'),
  (76, 91, 'home'), (78, 91, 'away'),
  (79, 92, 'home'), (80, 92, 'away'),
  (83, 93, 'home'), (84, 93, 'away'),
  (81, 94, 'home'), (82, 94, 'away'),
  (86, 95, 'home'), (88, 95, 'away'),
  (85, 96, 'home'), (87, 96, 'away'),
  (89, 97, 'home'), (90, 97, 'away'),
  (93, 98, 'home'), (94, 98, 'away'),
  (91, 99, 'home'), (92, 99, 'away'),
  (95, 100, 'home'), (96, 100, 'away'),
  (97, 101, 'home'), (98, 101, 'away'),
  (99, 102, 'home'), (100, 102, 'away'),
  (101, 104, 'home'), (102, 104, 'away'),
  (101, 103, 'home'), (102, 103, 'away');

create or replace function public.team_slot_code(
  p_group_letter char(1),
  p_group_position int
)
returns text
language sql
immutable
as $$
  select case
    when p_group_letter is null or p_group_position is null then null
    when p_group_position between 1 and 3 then p_group_position::text || p_group_letter::text
    else null
  end;
$$;

-- Round of 32 patterns for third-place combo B,D,E,F,I,J,K,L (reg. annex C).
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
    where m.stage = 'round_of_32'
      and m.match_number is null
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
      and (
        (home_slot = p.slot_home and away_slot = p.slot_away)
        or (home_slot = p.slot_away and away_slot = p.slot_home)
      );
  end loop;

  -- Later rounds: assign by feeder winners (partial match allowed when one team is wrong).
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
begin
  perform public.assign_knockout_match_numbers();

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

    if rec.match_number = 104 then
      update public.teams set tournament_stage = 'winner' where id = winner;
      update public.teams set tournament_stage = 'runner_up' where id = loser;
      continue;
    end if;

    if rec.match_number = 103 then
      update public.teams set tournament_stage = 'eliminated' where id = loser;
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
      update public.teams set tournament_stage = winner_stage where id = winner;
    end if;

    if rec.match_number not in (101, 102) then
      update public.teams set tournament_stage = 'eliminated' where id = loser;
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
end;
$$;

select public.assign_knockout_match_numbers();
select public.advance_knockout_winners();
