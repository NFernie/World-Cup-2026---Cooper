-- Host-assigned teams: members join without a nation until the host assigns from the leaderboard

create type public.team_assignment_mode as enum ('automatic', 'host');

alter table public.pools
  add column if not exists team_assignment_mode public.team_assignment_mode not null default 'automatic';

alter table public.pool_members
  alter column assigned_team_id drop not null;

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
      and pm.assigned_team_id is not null
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
  v_mode public.team_assignment_mode;
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

  select team_assignment_mode into v_mode
  from public.pools
  where id = p_pool_id;

  if v_mode is null then
    raise exception 'Pool not found';
  end if;

  insert into public.profiles (id, email, username)
  select
    u.id,
    u.email,
    coalesce(
      nullif(lower(trim(u.raw_user_meta_data->>'username')), ''),
      lower(split_part(coalesce(u.email, ''), '@', 1))
    )
  from auth.users u
  where u.id = v_user_id
  on conflict (id) do nothing;

  select coalesce(max(join_order), 0) + 1 into v_join_order
  from public.pool_members where pool_id = p_pool_id;

  v_round := (v_join_order - 1) / 48;

  if v_mode = 'automatic' then
    v_team_id := public.assign_team_for_pool_member(p_pool_id);
  else
    v_team_id := null;
  end if;

  insert into public.pool_members (
    pool_id, user_id, display_name, assigned_team_id, join_order, assignment_round
  ) values (
    p_pool_id, v_user_id, p_display_name, v_team_id, v_join_order, v_round
  )
  returning * into v_member;

  return v_member;
end;
$$;

create or replace function public.assign_pool_member_team(p_pool_member_id uuid)
returns public.pool_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.pool_members;
  v_host_id uuid;
  v_mode public.team_assignment_mode;
  v_round int;
  v_available uuid[];
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_member
  from public.pool_members pm
  where pm.id = p_pool_member_id;

  if v_member.id is null then
    raise exception 'Member not found';
  end if;

  select host_user_id, team_assignment_mode
  into v_host_id, v_mode
  from public.pools
  where id = v_member.pool_id;

  if v_host_id != auth.uid() then
    raise exception 'Only the group host can assign teams';
  end if;

  if v_mode != 'host' then
    raise exception 'This group uses automatic team assignment';
  end if;

  if v_member.assigned_team_id is not null then
    raise exception 'Member already has a team';
  end if;

  v_round := (v_member.join_order - 1) / 48;

  select array_agg(t.id order by random())
  into v_available
  from public.teams t
  where t.id not in (
    select pm.assigned_team_id
    from public.pool_members pm
    where pm.pool_id = v_member.pool_id
      and pm.assignment_round = v_round
      and pm.assigned_team_id is not null
  );

  if v_available is null or array_length(v_available, 1) is null then
    select array_agg(t.id order by random())
    into v_available
    from public.teams t;
  end if;

  v_team_id := v_available[1 + floor(random() * array_length(v_available, 1))::int];

  update public.pool_members
  set assigned_team_id = v_team_id
  where id = p_pool_member_id
  returning * into v_member;

  return v_member;
end;
$$;

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
left join public.teams t on t.id = pm.assigned_team_id
left join public.member_match_points mmp on mmp.pool_member_id = pm.id
group by pm.pool_id, pm.id, pm.user_id, pm.display_name, pm.assigned_team_id, t.name, t.fifa_code;

grant execute on function public.assign_pool_member_team(uuid) to authenticated;
