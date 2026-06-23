-- Golden Boot / Glove: refresh every minute when matches are live or recently finished.
-- Full squad-poll sync (48 GK API calls) stays on a daily schedule.

SELECT cron.unschedule('wc26-sync-tournament-awards')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wc26-sync-tournament-awards');

SELECT cron.schedule(
  'wc26-sync-tournament-awards',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/sync-tournament-awards',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"mode":"light"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'wc26-sync-tournament-awards-full',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/sync-tournament-awards',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"mode":"full"}'::jsonb
  ) AS request_id;
  $$
);
