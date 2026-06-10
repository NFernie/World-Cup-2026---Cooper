-- League id from API-Football baseline row (for read-time league tier multiplier).

alter table public.squad_players
  add column if not exists baseline_league_id integer;

comment on column public.squad_players.baseline_league_id is
  'API-Football league id from the rating baseline row (populated on next sync-squads run).';
