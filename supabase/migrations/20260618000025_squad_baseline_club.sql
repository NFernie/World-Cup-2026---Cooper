-- Persist club team id from 2025 domestic baseline for lineup position enrichment.

alter table public.squad_players
  add column if not exists baseline_club_api_team_id integer;

comment on column public.squad_players.baseline_club_api_team_id is
  'API-Football club team id from domestic_2025/club_2025 baseline (for lineup grid lookup).';

comment on column public.squad_players.rating_source is
  'domestic_2025 | club_2025 | national_2025 | manual | unrated (legacy: api, fallback)';
