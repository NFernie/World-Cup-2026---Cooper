-- Re-sync live match events so red cards are captured after syncMatchEvents update.
update public.matches
set events_synced_at = null
where status = 'live';
