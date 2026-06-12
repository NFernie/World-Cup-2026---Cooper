-- Fast live poll every 2 minutes (5-min full sync unchanged). Skips API when no live window.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'wc26-sync-match-results-live') then
    perform cron.unschedule('wc26-sync-match-results-live');
  end if;
end $do$;

select cron.schedule(
  'wc26-sync-match-results-live',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-match-results',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode":"live"}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
