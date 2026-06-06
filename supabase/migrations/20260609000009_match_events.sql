-- Per-match goal scorers and assists (synced during live poll window from API-Football events).

alter table public.matches
  add column if not exists events_synced_at timestamptz;

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  minute int not null,
  extra_minute int,
  team_api_id int,
  player_name text not null,
  assist_name text,
  event_type text not null default 'Goal',
  detail text,
  sort_order int not null default 0,
  synced_at timestamptz not null default now(),
  unique (match_id, sort_order)
);

create index if not exists match_events_match_id_idx on public.match_events (match_id);

alter table public.match_events enable row level security;

create policy match_events_select on public.match_events
  for select to authenticated using (true);

grant select on public.match_events to authenticated;
