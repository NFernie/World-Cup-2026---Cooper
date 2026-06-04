-- API-Football team mapping for award sync (top scorers / goalkeepers)

alter table public.teams
  add column if not exists api_football_team_id int;

create unique index if not exists teams_api_football_team_id_key
  on public.teams (api_football_team_id)
  where api_football_team_id is not null;

comment on column public.teams.api_football_team_id is
  'API-Football team id; set by sync-tournament-awards from /teams?league=&season=';

alter table public.teams
  add column if not exists awards_synced_at timestamptz;
