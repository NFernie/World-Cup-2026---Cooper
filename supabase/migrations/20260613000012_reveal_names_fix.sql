-- Fix host toggle: grant pool updates + security-definer RPC for reliability

grant update on public.pools to authenticated;

create or replace function public.set_pool_reveal_names(
  p_pool_id uuid,
  p_reveal_names boolean
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
  set reveal_names = p_reveal_names
  where id = p_pool_id
    and host_user_id = auth.uid()
  returning * into v_pool;

  if v_pool.id is null then
    raise exception 'Only the group host can change user name visibility';
  end if;

  return v_pool;
end;
$$;

grant execute on function public.set_pool_reveal_names(uuid, boolean) to authenticated;
