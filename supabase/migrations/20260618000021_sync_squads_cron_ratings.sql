-- Cron: roster sync by default; weekly full rating refresh on Sundays.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wc26-sync-squads') then
    perform cron.unschedule('wc26-sync-squads');
  end if;
end $$;

select cron.schedule(
  'wc26-sync-squads',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-squads',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'includeRatings', extract(dow from now() at time zone 'utc') = 0
    ),
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);
