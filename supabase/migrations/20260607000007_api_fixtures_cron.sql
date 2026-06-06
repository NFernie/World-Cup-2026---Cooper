-- pg_cron schedules for API-Football edge functions (verify_jwt = false on each function).
-- After deploy: invoke sync-fixtures once to load 104 WC 2026 matches with external_id.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  job record;
begin
  for job in select jobname from cron.job where jobname like 'wc26-%' loop
    perform cron.unschedule(job.jobname);
  end loop;
end $$;

select cron.schedule(
  'wc26-sync-match-results',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-match-results',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);

select cron.schedule(
  'wc26-sync-match-odds',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-match-odds',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);

select cron.schedule(
  'wc26-sync-tournament-awards',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-tournament-awards',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);

select cron.schedule(
  'wc26-sync-fixtures',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-fixtures',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);
