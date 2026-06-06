-- Tighten API-Football cron: odds every 15 min (2h window only in function), awards once daily.
-- Results cron stays */5 but function skips API calls when no match is in live window.

do $$
declare
  job record;
begin
  for job in select jobname from cron.job where jobname like 'wc26-%' loop
    perform cron.unschedule(job.jobname);
  end loop;
end $$;

-- Live scores: every 5 min; edge function gates API to active matches only
select cron.schedule(
  'wc26-sync-match-results',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-match-results',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

-- Odds: every 15 min; edge function only fetches ~2h before kickoff, once per match
select cron.schedule(
  'wc26-sync-match-odds',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-match-odds',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

-- Golden Boot / Glove: once daily (was every 6h + bundled into results every 5 min)
select cron.schedule(
  'wc26-sync-tournament-awards',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-tournament-awards',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);

-- Fixture list refresh: once daily
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
