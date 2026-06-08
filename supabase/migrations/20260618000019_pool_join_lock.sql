-- Host control: lock a group so no new players can join (cap at 48 / close sign-ups).

alter table public.pools
  add column if not exists join_locked boolean not null default false;

-- Recreate join_pool to reject new members when the group is locked.
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
  v_locked boolean;
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

  select team_assignment_mode, join_locked
  into v_mode, v_locked
  from public.pools
  where id = p_pool_id;

  if v_mode is null then
    raise exception 'Pool not found';
  end if;

  if v_locked then
    raise exception 'This group is full — the host has closed new sign-ups.';
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

-- Host-only toggle for the join lock (mirrors set_pool_reveal_names).
create or replace function public.set_pool_join_locked(
  p_pool_id uuid,
  p_join_locked boolean
)
returns public.pools
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool public.pools;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.pools
  set join_locked = p_join_locked
  where id = p_pool_id
    and host_user_id = auth.uid()
  returning * into v_pool;

  if v_pool.id is null then
    raise exception 'Only the group host can lock or unlock sign-ups';
  end if;

  return v_pool;
end;
$$;

grant execute on function public.set_pool_join_locked(uuid, boolean) to authenticated;
