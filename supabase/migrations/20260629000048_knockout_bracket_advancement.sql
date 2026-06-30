-- Propagate knockout winners into later-round fixtures when matches finish.

alter table public.matches
  add column if not exists winner_team_id uuid references public.teams (id);

create index if not exists matches_winner_team_id_idx on public.matches (winner_team_id);

create or replace function public.knockout_match_winner_id(
  p_home_team_id uuid,
  p_away_team_id uuid,
  p_home_score int,
  p_away_score int,
  p_winner_team_id uuid
)
returns uuid
language sql
immutable
as $$
  select case
    when p_winner_team_id is not null then p_winner_team_id
    when p_home_score is not null and p_away_score is not null and p_home_score > p_away_score then p_home_team_id
    when p_home_score is not null and p_away_score is not null and p_away_score > p_home_score then p_away_team_id
    else null
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
  winner uuid;
  loser uuid;
  next_stage public.tournament_stage;
  winner_stage public.tournament_stage;
  next_matches uuid[];
  target_id uuid;
  slot_index int;
  feeder_index int;
begin
  for rec in
    select
      m.id,
      m.stage,
      m.home_team_id,
      m.away_team_id,
      m.home_score,
      m.away_score,
      m.winner_team_id,
      row_number() over (
        partition by m.stage
        order by m.kickoff_at asc, m.id asc
      )::int - 1 as match_index
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
        else 99
      end,
      m.kickoff_at asc,
      m.id asc
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

    if rec.stage = 'final' then
      update public.teams
      set tournament_stage = 'winner'
      where id = winner;

      update public.teams
      set tournament_stage = 'runner_up'
      where id = loser;
      continue;
    end if;

    if rec.stage = 'third_place' then
      update public.teams
      set tournament_stage = 'eliminated'
      where id = loser;
      continue;
    end if;

    next_stage := case rec.stage
      when 'round_of_32' then 'round_of_16'::public.tournament_stage
      when 'round_of_16' then 'quarter_final'::public.tournament_stage
      when 'quarter_final' then 'semi_final'::public.tournament_stage
      when 'semi_final' then 'final'::public.tournament_stage
      else null
    end;

    winner_stage := case rec.stage
      when 'round_of_32' then 'round_of_16'::public.tournament_stage
      when 'round_of_16' then 'quarter_final'::public.tournament_stage
      when 'quarter_final' then 'semi_final'::public.tournament_stage
      when 'semi_final' then 'final'::public.tournament_stage
      else null
    end;

    if winner_stage is not null then
      update public.teams
      set tournament_stage = winner_stage
      where id = winner;
    end if;

  update public.teams
  set tournament_stage = 'eliminated'
  where id = loser
    and rec.stage <> 'semi_final';

    if next_stage is null then
      continue;
    end if;

    select coalesce(array_agg(m.id order by m.kickoff_at asc, m.id asc), '{}')
    into next_matches
    from public.matches m
    where m.stage = next_stage;

    if coalesce(array_length(next_matches, 1), 0) = 0 then
      continue;
    end if;

    feeder_index := rec.match_index / 2;
    if feeder_index >= coalesce(array_length(next_matches, 1), 0) then
      continue;
    end if;

    target_id := next_matches[feeder_index + 1];
    slot_index := rec.match_index % 2;

    if slot_index = 0 then
      update public.matches
      set home_team_id = winner
      where id = target_id
        and home_team_id is distinct from winner;
    else
      update public.matches
      set away_team_id = winner
      where id = target_id
        and away_team_id is distinct from winner;
    end if;

    if rec.stage = 'semi_final' then
      select coalesce(array_agg(m.id order by m.kickoff_at asc, m.id asc), '{}')
      into next_matches
      from public.matches m
      where m.stage = 'third_place';

      if coalesce(array_length(next_matches, 1), 0) > 0 then
        target_id := next_matches[1];
        if rec.match_index = 0 then
          update public.matches
          set home_team_id = loser
          where id = target_id
            and home_team_id is distinct from loser;
        else
          update public.matches
          set away_team_id = loser
          where id = target_id
            and away_team_id is distinct from loser;
        end if;
      end if;
    end if;
  end loop;
end;
$$;

grant execute on function public.advance_knockout_winners(uuid) to authenticated;
grant execute on function public.advance_knockout_winners(uuid) to service_role;

-- Backfill bracket from already-finished knockout matches.
select public.advance_knockout_winners();
