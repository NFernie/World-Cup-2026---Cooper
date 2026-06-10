-- Daily squad sync: positions only for players missing position_code (no ratings burn).
-- Edge function exits immediately with 0 API calls when all players are positioned.

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
      'includePositions', true
    ),
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
