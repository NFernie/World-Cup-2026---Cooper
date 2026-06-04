-- Username + password auth (synthetic auth email; unique public username)

alter table public.profiles
  add column if not exists username text;

-- Backfill existing profiles before NOT NULL
update public.profiles p
set username = lower(regexp_replace(split_part(coalesce(p.email, ''), '@', 1), '[^a-z0-9_]', '_', 'g'))
where p.username is null
  and p.email is not null
  and split_part(p.email, '@', 1) <> '';

update public.profiles p
set username = 'user_' || substr(replace(p.id::text, '-', ''), 1, 8)
where p.username is null;

-- Resolve collisions from backfill
update public.profiles p
set username = p.username || '_' || substr(replace(p.id::text, '-', ''), 1, 4)
where exists (
  select 1
  from public.profiles p2
  where lower(p2.username) = lower(p.username)
    and p2.id <> p.id
    and p2.ctid < p.ctid
);

alter table public.profiles
  alter column username set not null;

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

comment on column public.profiles.username is
  'Unique login name; auth.users.email is synthetic (username@wc26.auth.local).';

-- Username availability for sign-up (callable before session exists)
create or replace function public.is_username_available(p_username text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(p_username));
begin
  if v_username is null or length(v_username) < 3 or length(v_username) > 20 then
    return false;
  end if;
  if v_username !~ '^[a-z0-9_]+$' then
    return false;
  end if;
  return not exists (
    select 1 from public.profiles where lower(username) = v_username
  );
end;
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(new.raw_user_meta_data->>'username'));
begin
  if v_username is null or v_username = '' then
    v_username := lower(split_part(coalesce(new.email, ''), '@', 1));
    v_username := regexp_replace(v_username, '[^a-z0-9_]', '_', 'g');
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

-- join_pool: ensure profile row exists (username set at signup)
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
