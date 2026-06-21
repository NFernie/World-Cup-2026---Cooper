/**
 * Sync Golden Boot / Golden Glove from API-Football into public.teams.
 * Requires teams.api_football_team_id (populated via /teams?league&season).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { normalizeTeamName, resolveFifaCode } from "./fifa-code-map.ts";

const API_BASE = "https://v3.football.api-sports.io";

type ApiTeam = { id: number; name: string; code: string | null };
type DbTeam = { id: string; fifa_code: string; name: string };

function apiHeaders(apiKey: string) {
  return { "x-apisports-key": apiKey };
}

function parseIntSafe(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : 0;
}

function pickLeagueStats(
  statistics: Record<string, unknown>[] | undefined,
  leagueId: string,
): Record<string, unknown> | undefined {
  if (!statistics?.length) return undefined;
  const id = parseInt(leagueId, 10);
  const match = statistics.find((s) => {
    const league = s.league as { id?: number } | undefined;
    return league?.id === id;
  });
  return match ?? statistics[0];
}

function getCleanSheets(stat: Record<string, unknown>): number {
  const goals = stat.goals as Record<string, unknown> | undefined;
  if (goals?.clean_sheet != null) return parseIntSafe(goals.clean_sheet);
  if (goals?.cleansheets != null) return parseIntSafe(goals.cleansheets);
  const games = stat.games as Record<string, unknown> | undefined;
  if (games?.clean_sheet != null) return parseIntSafe(games.clean_sheet);
  if (games?.cleansheets != null) return parseIntSafe(games.cleansheets);
  return 0;
}

function isGoalkeeper(stat: Record<string, unknown>, player: Record<string, unknown>): boolean {
  const games = stat.games as Record<string, unknown> | undefined;
  const pos = String(games?.position ?? player.position ?? "").toLowerCase();
  return pos.includes("goalkeeper") || pos === "gk";
}

/** Count shutout wins from synced finished matches (tournament source of truth). */
export async function syncCleanSheetsFromMatchResults(
  supabase: SupabaseClient,
): Promise<number> {
  const { data: matches } = await supabase
    .from("matches")
    .select("home_team_id, away_team_id, home_score, away_score")
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  const csByTeam = new Map<string, number>();
  for (const m of matches ?? []) {
    if (m.away_score === 0) {
      csByTeam.set(m.home_team_id, (csByTeam.get(m.home_team_id) ?? 0) + 1);
    }
    if (m.home_score === 0) {
      csByTeam.set(m.away_team_id, (csByTeam.get(m.away_team_id) ?? 0) + 1);
    }
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .not("golden_glove_player_name", "is", null);

  let updated = 0;
  for (const team of teams ?? []) {
    const cs = csByTeam.get(team.id) ?? 0;
    const { error } = await supabase
      .from("teams")
      .update({ golden_glove_clean_sheets: cs })
      .eq("id", team.id);
    if (!error) updated++;
  }

  return updated;
}

export async function syncApiFootballTeamIds(
  supabase: SupabaseClient,
  apiKey: string,
  leagueId: string,
  season: string,
): Promise<number> {
  const { data: dbTeams } = await supabase.from("teams").select("id, fifa_code, name");
  const knownFifaCodes = new Set((dbTeams ?? []).map((t) => t.fifa_code));
  const byFifa = new Map((dbTeams ?? []).map((t) => [t.fifa_code, t as DbTeam]));
  const byName = new Map((dbTeams ?? []).map((t) => [normalizeTeamName(t.name), t as DbTeam]));

  const res = await fetch(`${API_BASE}/teams?league=${leagueId}&season=${season}`, {
    headers: apiHeaders(apiKey),
  });
  if (!res.ok) return 0;

  const payload = await res.json();
  let mapped = 0;

  for (const row of payload.response ?? []) {
    const team = row.team as ApiTeam | undefined;
    if (!team?.id) continue;

    let fifaCode = resolveFifaCode(team.code, team.name, knownFifaCodes);
    let dbTeam: DbTeam | undefined = fifaCode ? byFifa.get(fifaCode) : undefined;

    if (!dbTeam) {
      dbTeam = byName.get(normalizeTeamName(team.name));
    }
    if (!dbTeam) continue;

    const { error } = await supabase
      .from("teams")
      .update({ api_football_team_id: team.id })
      .eq("id", dbTeam.id);

    if (!error) mapped++;
  }

  return mapped;
}

export async function syncTopScorersByTeam(
  supabase: SupabaseClient,
  apiKey: string,
  leagueId: string,
  season: string,
): Promise<number> {
  const res = await fetch(
    `${API_BASE}/players/topscorers?league=${leagueId}&season=${season}`,
    { headers: apiHeaders(apiKey) },
  );
  if (!res.ok) return 0;

  const payload = await res.json();
  const bestByTeam = new Map<number, { name: string; goals: number }>();

  for (const row of payload.response ?? []) {
    const player = row.player as Record<string, unknown> | undefined;
    const stats = (row.statistics as Record<string, unknown>[] | undefined)?.[0] as
      | Record<string, unknown>
      | undefined;
    if (!player || !stats) continue;

    const team = stats.team as ApiTeam | undefined;
    if (!team?.id) continue;

    const goals = parseIntSafe((stats.goals as Record<string, unknown> | undefined)?.total);
    const name = String(player.name ?? `${player.firstname ?? ""} ${player.lastname ?? ""}`.trim());
    if (!name) continue;

    const prev = bestByTeam.get(team.id);
    if (!prev || goals > prev.goals) {
      bestByTeam.set(team.id, { name, goals });
    }
  }

  let updated = 0;
  for (const [apiTeamId, scorer] of bestByTeam) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id")
      .eq("api_football_team_id", apiTeamId);

    for (const t of teams ?? []) {
      const { error } = await supabase
        .from("teams")
        .update({
          golden_boot_player_name: scorer.name,
          golden_boot_goals: scorer.goals,
          awards_synced_at: new Date().toISOString(),
        })
        .eq("id", t.id);
      if (!error) updated++;
    }
  }

  return updated;
}

export async function syncGoalkeepersByTeam(
  supabase: SupabaseClient,
  apiKey: string,
  leagueId: string,
  season: string,
): Promise<number> {
  const { data: teams } = await supabase
    .from("teams")
    .select("id, api_football_team_id, fifa_code")
    .not("api_football_team_id", "is", null);

  let updated = 0;

  for (const team of teams ?? []) {
    const apiTeamId = team.api_football_team_id;
    if (!apiTeamId) continue;

    const res = await fetch(
      `${API_BASE}/players?team=${apiTeamId}&season=${season}&league=${leagueId}`,
      { headers: apiHeaders(apiKey) },
    );
    if (!res.ok) continue;

    const payload = await res.json();
    let bestName: string | null = null;
    let bestCs = -1;
    let bestSaves = -1;

    for (const row of payload.response ?? []) {
      const player = row.player as Record<string, unknown> | undefined;
      const stats = pickLeagueStats(
        row.statistics as Record<string, unknown>[] | undefined,
        leagueId,
      );
      if (!player || !stats || !isGoalkeeper(stats, player)) continue;

      const cs = getCleanSheets(stats);
      const saves = parseIntSafe((stats.goals as Record<string, unknown> | undefined)?.saves);
      const name = String(player.name ?? `${player.firstname ?? ""} ${player.lastname ?? ""}`.trim());
      if (!name) continue;

      if (cs > bestCs || (cs === bestCs && saves > bestSaves)) {
        bestCs = cs;
        bestSaves = saves;
        bestName = name;
      }
    }

    if (!bestName) continue;

    const { error } = await supabase
      .from("teams")
      .update({
        golden_glove_player_name: bestName,
        awards_synced_at: new Date().toISOString(),
      })
      .eq("id", team.id);

    if (!error) updated++;

    await new Promise((r) => setTimeout(r, 120));
  }

  return updated;
}

export async function syncTournamentAwards(
  supabase: SupabaseClient,
  apiKey: string,
  leagueId: string,
  season: string,
): Promise<{
  teamIds: number;
  scorers: number;
  goalkeepers: number;
  cleanSheets: number;
  expectedTeams: number;
}> {
  const { count } = await supabase.from("teams").select("id", { count: "exact", head: true });
  const expectedTeams = count ?? 48;
  const teamIds = await syncApiFootballTeamIds(supabase, apiKey, leagueId, season);
  const scorers = await syncTopScorersByTeam(supabase, apiKey, leagueId, season);
  const goalkeepers = await syncGoalkeepersByTeam(supabase, apiKey, leagueId, season);
  const cleanSheets = await syncCleanSheetsFromMatchResults(supabase);
  return { teamIds, scorers, goalkeepers, cleanSheets, expectedTeams };
}
