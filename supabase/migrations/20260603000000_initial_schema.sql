-- World Cup 2026 Tipping Pool — initial schema
-- See PLAN.md Developer Responses for product rules

-- Extensions
create extension if not exists "pgcrypto";

-- Enums
create type match_status as enum ('scheduled', 'live', 'finished', 'postponed', 'cancelled');
create type tournament_stage as enum (
  'group',
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
  'winner',
  'runner_up',
  'eliminated'
);

-- National teams (48 at tournament)
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  fifa_code text not null unique,
  name text not null,
  group_letter char(1),
  flag_url text,
  -- Tournament standing (updated by sync / admin)
  tournament_stage tournament_stage not null default 'group',
  group_position int,
  group_points int not null default 0,
  group_goal_difference int not null default 0,
  tournament_rank int,
  created_at timestamptz not null default now()
);

-- Host-created competitions
create table public.pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host_user_id uuid not null references auth.users (id) on delete cascade,
  invite_code text not null unique default encode(gen_random_bytes(9), 'hex'),
  created_at timestamptz not null default now()
);

create index pools_invite_code_idx on public.pools (invite_code);

-- User profile (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Pool membership + assigned national team
create table public.pool_members (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  assigned_team_id uuid not null references public.teams (id),
  join_order int not null,
  assignment_round int not null default 0,
  created_at timestamptz not null default now(),
  unique (pool_id, user_id)
);

create index pool_members_pool_id_idx on public.pool_members (pool_id);
create index pool_members_assigned_team_id_idx on public.pool_members (assigned_team_id);
create unique index pool_members_pool_join_order_idx on public.pool_members (pool_id, join_order);

-- Matches
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  home_team_id uuid not null references public.teams (id),
  away_team_id uuid not null references public.teams (id),
  kickoff_at timestamptz not null,
  home_score int,
  away_score int,
  status match_status not null default 'scheduled',
  stage tournament_stage not null default 'group',
  odds_synced_at timestamptz,
  scores_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index matches_kickoff_at_idx on public.matches (kickoff_at);
create index matches_status_idx on public.matches (status);

-- Pre-match odds (API-Football); fetched ~2h before kickoff
create table public.match_odds (
  match_id uuid primary key references public.matches (id) on delete cascade,
  home_win_decimal numeric(6, 2) not null,
  draw_decimal numeric(6, 2) not null,
  away_win_decimal numeric(6, 2) not null,
  source text not null default 'api-football',
  fetched_at timestamptz not null default now()
);

-- Points earned by pool member when their assigned team wins a match
create table public.member_match_points (
  id uuid primary key default gen_random_uuid(),
  pool_member_id uuid not null references public.pool_members (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  points numeric(8, 2) not null,
  win_odds_decimal numeric(6, 2) not null,
  created_at timestamptz not null default now(),
  unique (pool_member_id, match_id)
);

-- Admin audit for manual score overrides
create table public.match_score_audit (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  admin_user_id uuid not null references auth.users (id),
  previous_home int,
  previous_away int,
  new_home int,
  new_away int,
  note text,
  created_at timestamptz not null default now()
);

-- Round-robin team assignment: see assign_team_for_pool_member()
create or replace function public.assign_team_for_pool_member(p_pool_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_count int;
  v_n int;
  v_round int;
  v_available uuid[];
  v_team_id uuid;
begin
  select count(*)::int into v_member_count
  from public.pool_members
  where pool_id = p_pool_id;

  v_n := v_member_count + 1;
  v_round := (v_n - 1) / 48;

  select array_agg(t.id order by random())
  into v_available
  from public.teams t
  where t.id not in (
    select pm.assigned_team_id
    from public.pool_members pm
    where pm.pool_id = p_pool_id
      and pm.assignment_round = v_round
  );

  if v_available is null or array_length(v_available, 1) is null then
    select array_agg(t.id order by random())
    into v_available
    from public.teams t;
  end if;

  v_team_id := v_available[1 + floor(random() * array_length(v_available, 1))::int];
  return v_team_id;
end;
$$;

-- Join pool: creates profile row, assigns team, returns member id
create or replace function public.join_pool(
  p_pool_id uuid,
  p_display_name text
)
returns public.pool_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_join_order int;
  v_round int;
  v_member public.pool_members;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (
    select 1 from public.pool_members where pool_id = p_pool_id and user_id = v_user_id
  ) then
    raise exception 'Already a member of this pool';
  end if;

  insert into public.profiles (id, email)
  values (v_user_id, (select email from auth.users where id = v_user_id))
  on conflict (id) do update set email = excluded.email;

  select coalesce(max(join_order), 0) + 1 into v_join_order
  from public.pool_members where pool_id = p_pool_id;

  v_round := (v_join_order - 1) / 48;
  v_team_id := public.assign_team_for_pool_member(p_pool_id);

  insert into public.pool_members (
    pool_id, user_id, display_name, assigned_team_id, join_order, assignment_round
  ) values (
    p_pool_id, v_user_id, p_display_name, v_team_id, v_join_order, v_round
  )
  returning * into v_member;

  return v_member;
end;
$$;

-- Recalculate odds-based points for finished matches
create or replace function public.recalculate_pool_member_points(p_match_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_winner_id uuid;
  v_odds numeric;
begin
  for r in
    select m.id as match_id,
           m.home_team_id,
           m.away_team_id,
           m.home_score,
           m.away_score,
           mo.home_win_decimal,
           mo.draw_decimal,
           mo.away_win_decimal
    from public.matches m
    join public.match_odds mo on mo.match_id = m.id
    where m.status = 'finished'
      and m.home_score is not null
      and m.away_score is not null
      and (p_match_id is null or m.id = p_match_id)
  loop
    if r.home_score > r.away_score then
      v_winner_id := r.home_team_id;
      v_odds := r.home_win_decimal;
    elsif r.away_score > r.home_score then
      v_winner_id := r.away_team_id;
      v_odds := r.away_win_decimal;
    else
      v_winner_id := null;
      v_odds := null;
    end if;

    if v_winner_id is null then
      continue;
    end if;

    insert into public.member_match_points (pool_member_id, match_id, points, win_odds_decimal)
    select pm.id, r.match_id, v_odds, v_odds
    from public.pool_members pm
    where pm.assigned_team_id = v_winner_id
    on conflict (pool_member_id, match_id) do update
      set points = excluded.points,
          win_odds_decimal = excluded.win_odds_decimal;
  end loop;
end;
$$;

-- Leaderboard: odds points (sum per member)
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
  count(mmp.id)::int as wins_scored
from public.pool_members pm
join public.teams t on t.id = pm.assigned_team_id
left join public.member_match_points mmp on mmp.pool_member_id = pm.id
group by pm.pool_id, pm.id, pm.user_id, pm.display_name, pm.assigned_team_id, t.name, t.fifa_code;

-- Leaderboard: tournament standing (team progress; co-managers share team row)
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
  count(pm.id)::int as co_manager_count
from public.pool_members pm
join public.teams t on t.id = pm.assigned_team_id
group by pm.pool_id, t.id, t.name, t.fifa_code, t.tournament_stage, t.tournament_rank,
         t.group_letter, t.group_position, t.group_points, t.group_goal_difference;

-- Co-managers for a team in a pool
create or replace view public.pool_team_co_managers as
select
  pm.pool_id,
  pm.assigned_team_id as team_id,
  t.name as team_name,
  pm.id as pool_member_id,
  pm.display_name,
  pm.user_id,
  pm.join_order
from public.pool_members pm
join public.teams t on t.id = pm.assigned_team_id;

-- RLS
alter table public.teams enable row level security;
alter table public.pools enable row level security;
alter table public.profiles enable row level security;
alter table public.pool_members enable row level security;
alter table public.matches enable row level security;
alter table public.match_odds enable row level security;
alter table public.member_match_points enable row level security;
alter table public.match_score_audit enable row level security;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Teams: public read
create policy teams_select on public.teams for select to authenticated using (true);

-- Pools: members read; host creates; anyone authenticated can read pool by invite (for join flow)
create policy pools_select on public.pools for select to authenticated using (true);
create policy pools_insert on public.pools for insert to authenticated
  with check (host_user_id = auth.uid());

-- Profiles: own row
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid());

-- Pool members
create policy pool_members_select on public.pool_members for select to authenticated using (true);
create policy pool_members_insert on public.pool_members for insert to authenticated
  with check (user_id = auth.uid());

-- Matches & odds: read all
create policy matches_select on public.matches for select to authenticated using (true);
create policy match_odds_select on public.match_odds for select to authenticated using (true);

-- Member points: read all in pool context
create policy member_match_points_select on public.member_match_points for select to authenticated using (true);

-- Super admin can update matches, teams, reassign members
create policy matches_admin_update on public.matches for update to authenticated
  using (public.is_super_admin());
create policy teams_admin_update on public.teams for update to authenticated
  using (public.is_super_admin());
create policy pool_members_admin_update on public.pool_members for update to authenticated
  using (public.is_super_admin());
create policy match_score_audit_insert on public.match_score_audit for insert to authenticated
  with check (public.is_super_admin());

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Grant execute on RPCs
grant execute on function public.join_pool(uuid, text) to authenticated;
grant execute on function public.assign_team_for_pool_member(uuid) to authenticated;
