-- Daily WC match form sync (separate from baseline sync-squads).

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wc26-sync-squad-form') then
    perform cron.unschedule('wc26-sync-squad-form');
  end if;
end $$;

select cron.schedule(
  'wc26-sync-squad-form',
  '45 4 * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-squad-form',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
