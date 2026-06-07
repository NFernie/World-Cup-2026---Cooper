-- Host-controlled reveal of member display names + member advisory poll

alter table public.pools
  add column if not exists reveal_names boolean not null default false;

create table public.pool_reveal_name_votes (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  pool_member_id uuid not null references public.pool_members (id) on delete cascade,
  wants_reveal boolean not null,
  updated_at timestamptz not null default now(),
  unique (pool_id, pool_member_id)
);

create index pool_reveal_name_votes_pool_id_idx on public.pool_reveal_name_votes (pool_id);

alter table public.pool_reveal_name_votes enable row level security;

-- Host may toggle reveal_names on pools they own
create policy pools_host_update on public.pools
  for update to authenticated
  using (host_user_id = auth.uid())
  with check (host_user_id = auth.uid());

create policy pool_reveal_votes_select on public.pool_reveal_name_votes
  for select to authenticated
  using (true);

create policy pool_reveal_votes_insert on public.pool_reveal_name_votes
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.pool_members pm
      where pm.id = pool_member_id
        and pm.pool_id = pool_id
        and pm.user_id = auth.uid()
    )
  );

create policy pool_reveal_votes_update on public.pool_reveal_name_votes
  for update to authenticated
  using (
    exists (
      select 1
      from public.pool_members pm
      where pm.id = pool_member_id
        and pm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.pool_members pm
      where pm.id = pool_member_id
        and pm.pool_id = pool_id
        and pm.user_id = auth.uid()
    )
  );

grant select, insert, update on public.pool_reveal_name_votes to authenticated;
