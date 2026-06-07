-- Per-group banter/comments stream

create table public.pool_banter_messages (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  pool_member_id uuid not null references public.pool_members (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  message text not null check (char_length(trim(message)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index pool_banter_messages_pool_created_idx
  on public.pool_banter_messages (pool_id, created_at desc);

alter table public.pool_banter_messages enable row level security;

create policy pool_banter_messages_select on public.pool_banter_messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.pool_members pm
      where pm.pool_id = pool_banter_messages.pool_id
        and pm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.pools p
      where p.id = pool_banter_messages.pool_id
        and p.host_user_id = auth.uid()
    )
  );

create policy pool_banter_messages_insert on public.pool_banter_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.pool_members pm
      where pm.id = pool_member_id
        and pm.pool_id = pool_banter_messages.pool_id
        and pm.user_id = auth.uid()
        and pm.display_name = pool_banter_messages.display_name
    )
  );

grant select, insert on public.pool_banter_messages to authenticated;
