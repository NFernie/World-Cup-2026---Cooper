-- Re-sync goals and cards for finished matches (hindsight backfill after card sync improvements).
update public.matches
set events_synced_at = null
where status = 'finished'
  and external_id is not null;
