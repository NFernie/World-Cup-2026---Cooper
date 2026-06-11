-- Temporary WC match form (does not overwrite baseline overall_rating or rating_source).

alter table public.squad_players
  add column if not exists form_boost_pct numeric(5, 2) not null default 0,
  add column if not exists form_match_rating numeric(3, 1),
  add column if not exists form_fixture_ids jsonb,
  add column if not exists form_synced_at timestamptz;

comment on column public.squad_players.form_boost_pct is
  'Temporary % modifier on stored raw OVR from latest WC match rating (±2% cap).';
comment on column public.squad_players.form_match_rating is
  'API-Football games.rating from the latest qualifying national match.';
comment on column public.squad_players.form_fixture_ids is
  'Audit: API fixture id(s) used for the current form boost.';
comment on column public.squad_players.form_synced_at is
  'When form_boost_pct was last computed; decay clears after 3+ days idle.';
