-- Specific player position codes (LB, ST, etc.) derived from API lineups where available.

alter table public.squad_players
  add column if not exists position_code text;

comment on column public.squad_players.position is 'Position family: GK | DEF | MID | FWD';
comment on column public.squad_players.position_detail is 'Raw API-Football squad label (e.g. Defender)';
comment on column public.squad_players.position_code is 'Specific role when known (e.g. LB, CB, ST) from lineup grid inference';
