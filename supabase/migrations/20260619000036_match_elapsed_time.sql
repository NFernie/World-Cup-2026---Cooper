-- Live match clock from API-Football (elapsed minutes + period short code).
alter table public.matches
  add column if not exists api_status_short text,
  add column if not exists elapsed_minutes int,
  add column if not exists extra_minutes int,
  add column if not exists status_synced_at timestamptz;
