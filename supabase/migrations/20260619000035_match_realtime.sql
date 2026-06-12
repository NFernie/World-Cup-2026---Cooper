-- Push match score/event updates to connected clients when sync-match-results writes.
do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_events'
  ) then
    alter publication supabase_realtime add table public.match_events;
  end if;
end $do$;
