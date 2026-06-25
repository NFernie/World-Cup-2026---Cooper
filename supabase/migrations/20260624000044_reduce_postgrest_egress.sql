-- Cut PostgREST egress: full match-results + awards every 5 min; live poll stays every minute.

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'wc26-sync-match-results') then
    perform cron.unschedule('wc26-sync-match-results');
  end if;
  if exists (select 1 from cron.job where jobname = 'wc26-sync-tournament-awards') then
    perform cron.unschedule('wc26-sync-tournament-awards');
  end if;
end $do$;

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
  'wc26-sync-tournament-awards',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/sync-tournament-awards',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"mode":"light"}'::jsonb
  ) as request_id;
  $$
);
