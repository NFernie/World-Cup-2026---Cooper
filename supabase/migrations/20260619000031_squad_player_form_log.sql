-- Observability for daily form sync changes.

create table if not exists public.squad_player_form_log (
  id uuid primary key default gen_random_uuid(),
  squad_player_id uuid not null references public.squad_players (id) on delete cascade,
  api_football_player_id integer,
  fixture_external_id text,
  match_rating numeric(3, 1),
  minutes integer,
  old_boost_pct numeric(5, 2),
  new_boost_pct numeric(5, 2) not null,
  reason text not null,
  synced_at timestamptz not null default now()
);

create index if not exists squad_player_form_log_player_idx
  on public.squad_player_form_log (squad_player_id, synced_at desc);

alter table public.squad_player_form_log enable row level security;

-- Service role / edge functions only; no public read policy.

grant all on public.squad_player_form_log to service_role;
