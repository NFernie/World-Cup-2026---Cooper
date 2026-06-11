-- UCL/UEL eligibility for read-time star floor (even when national row is the baseline).

alter table public.squad_players
  add column if not exists has_continental_rating boolean not null default false;

comment on column public.squad_players.has_continental_rating is
  'True when API-Football 2025 stats include a rated UEFA continental club row (≥45 min).';
