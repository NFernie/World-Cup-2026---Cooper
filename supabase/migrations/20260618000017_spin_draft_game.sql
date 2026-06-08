-- Spin Draft mini-game: World Cup 2026 squad players + game sessions.
-- Side game only — does not affect pool points or any leaderboard.

-- ---------------------------------------------------------------------------
-- App settings (feature flags: provisional squads, game enabled)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('spin_draft', '{"enabled": true, "squads_provisional": true}'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

create policy app_settings_select on public.app_settings
  for select to authenticated using (true);

grant select on public.app_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Squad players (footballers — distinct from pool_members)
-- ---------------------------------------------------------------------------
create table if not exists public.squad_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  api_football_player_id int,
  name text not null,
  position text not null,            -- normalized: GK | DEF | MID | FWD
  position_detail text,              -- raw API position (e.g. Goalkeeper, Attacker)
  shirt_number int,
  photo_url text,
  overall_rating int not null default 62 check (overall_rating between 1 and 99),
  rating_source text not null default 'fallback',  -- api | fallback | manual
  synced_at timestamptz not null default now(),
  unique (team_id, api_football_player_id)
);

create index if not exists squad_players_team_idx on public.squad_players (team_id);
create index if not exists squad_players_position_idx on public.squad_players (position);

alter table public.squad_players enable row level security;

create policy squad_players_select on public.squad_players
  for select to authenticated using (true);

grant select on public.squad_players to authenticated;

-- ---------------------------------------------------------------------------
-- Game sessions + picks (per user, optional pool context)
-- ---------------------------------------------------------------------------
create table if not exists public.xi_game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pool_id uuid references public.pools (id) on delete set null,
  formation text not null,
  mode text not null default 'classic',
  status text not null default 'drafting',  -- drafting | complete
  result_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists xi_game_sessions_user_idx
  on public.xi_game_sessions (user_id, created_at desc);

alter table public.xi_game_sessions enable row level security;

create policy xi_game_sessions_select on public.xi_game_sessions
  for select to authenticated using (user_id = auth.uid());

create policy xi_game_sessions_insert on public.xi_game_sessions
  for insert to authenticated with check (user_id = auth.uid());

create policy xi_game_sessions_update on public.xi_game_sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.xi_game_sessions to authenticated;

create table if not exists public.xi_game_picks (
  session_id uuid not null references public.xi_game_sessions (id) on delete cascade,
  round int not null,
  spun_team_id uuid references public.teams (id) on delete set null,
  squad_player_id uuid references public.squad_players (id) on delete set null,
  slot_position text not null,
  primary key (session_id, round)
);

alter table public.xi_game_picks enable row level security;

create policy xi_game_picks_select on public.xi_game_picks
  for select to authenticated using (
    exists (
      select 1 from public.xi_game_sessions s
      where s.id = xi_game_picks.session_id and s.user_id = auth.uid()
    )
  );

create policy xi_game_picks_insert on public.xi_game_picks
  for insert to authenticated with check (
    exists (
      select 1 from public.xi_game_sessions s
      where s.id = xi_game_picks.session_id and s.user_id = auth.uid()
    )
  );

grant select, insert on public.xi_game_picks to authenticated;
