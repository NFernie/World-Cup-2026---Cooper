-- Prompt 006: awards leaderboards, elimination boards, global FIFA rank, relaxed usernames

alter table public.teams
  add column if not exists global_fifa_rank int,
  add column if not exists golden_boot_player_name text,
  add column if not exists golden_boot_goals int not null default 0,
  add column if not exists golden_glove_player_name text,
  add column if not exists golden_glove_clean_sheets int not null default 0;

comment on column public.teams.global_fifa_rank is
  'FIFA world ranking (lower number = stronger). Used for elimination / knockout boards.';
comment on column public.teams.golden_boot_player_name is
  'National team player tracked for Golden Boot (top scorer).';
comment on column public.teams.golden_glove_player_name is
  'National team goalkeeper tracked for Golden Glove.';

-- Seed illustrative ranks and award candidates (admin can override)
update public.teams t
set global_fifa_rank = sub.rn
from (
  select id, row_number() over (order by name) as rn
  from public.teams
) sub
where t.id = sub.id and t.global_fifa_rank is null;

-- Golden Boot leaderboard per pool (teams in pool, player + goals; names hidden for managers)
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
  ) as boot_rank
from public.pool_members pm
join public.teams t on t.id = pm.assigned_team_id
where t.golden_boot_player_name is not null
group by pm.pool_id, t.id, t.name, t.fifa_code, t.golden_boot_player_name,
         t.golden_boot_goals, t.global_fifa_rank;

-- Golden Glove leaderboard per pool
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
  ) as glove_rank
from public.pool_members pm
join public.teams t on t.id = pm.assigned_team_id
where t.golden_glove_player_name is not null
group by pm.pool_id, t.id, t.name, t.fifa_code, t.golden_glove_player_name,
         t.golden_glove_clean_sheets, t.global_fifa_rank;

-- Eliminated nations (group stage exit), ordered by global FIFA rank
create or replace view public.board_group_eliminations as
select
  t.id as team_id,
  t.name as team_name,
  t.fifa_code,
  t.tournament_stage,
  t.global_fifa_rank,
  t.tournament_rank,
  t.group_letter,
  t.group_position
from public.teams t
where t.tournament_stage = 'eliminated';

-- Nations in knockout phase (advanced from groups)
create or replace view public.board_knockout_qualifiers as
select
  t.id as team_id,
  t.name as team_name,
  t.fifa_code,
  t.tournament_stage,
  t.global_fifa_rank,
  t.tournament_rank
from public.teams t
where t.tournament_stage in (
  'round_of_32', 'round_of_16', 'quarter_final', 'semi_final',
  'third_place', 'final', 'winner', 'runner_up'
);

-- Relaxed username rules: letters (any case), digits, underscore, hyphen, dot
create or replace function public.is_username_available(p_username text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := trim(p_username);
begin
  if v_username is null or length(v_username) < 3 or length(v_username) > 24 then
    return false;
  end if;
  if v_username !~ '^[a-zA-Z0-9_.-]+$' then
    return false;
  end if;
  return not exists (
    select 1 from public.profiles where lower(username) = lower(v_username)
  );
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := trim(new.raw_user_meta_data->>'username');
begin
  if v_username is null or v_username = '' then
    v_username := lower(split_part(coalesce(new.email, ''), '@', 1));
    v_username := regexp_replace(v_username, '[^a-zA-Z0-9_.-]', '_', 'g');
  end if;

  if v_username is null or length(v_username) < 3 then
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  insert into public.profiles (id, email, username)
  values (new.id, new.email, v_username)
  on conflict (id) do update
    set email = excluded.email,
        username = excluded.username;

  return new;
exception
  when unique_violation then
    raise exception 'Username already taken' using errcode = '23505';
end;
$$;

grant select on public.leaderboard_golden_boot to authenticated;
grant select on public.leaderboard_golden_glove to authenticated;
grant select on public.board_group_eliminations to authenticated;

-- Demo award rows (admin can edit via dashboard / future admin UI)
update public.teams
set
  golden_boot_player_name = coalesce(golden_boot_player_name, 'Squad forward'),
  golden_glove_player_name = coalesce(golden_glove_player_name, 'No. 1 goalkeeper')
where golden_boot_player_name is null or golden_glove_player_name is null;

grant select on public.board_knockout_qualifiers to authenticated;
