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

function isCountableBootGoal(detail: string | null | undefined): boolean {
  if (!detail) return true;
  const d = detail.toLowerCase();
  return d !== "own goal" && d !== "missed penalty";
}

/** True when any match is live or recently finished (awards should refresh). */
export async function isInAwardsSyncWindow(supabase: SupabaseClient): Promise<boolean> {
  const { data: matches } = await supabase
    .from("matches")
    .select("kickoff_at, status")
    .not("external_id", "is", null);

  const nowMs = Date.now();
  const tournamentWindowMs = 60 * 24 * 60 * 60 * 1000;

  for (const m of matches ?? []) {
    const kickoff = new Date(m.kickoff_at).getTime();
    const matchEnd = kickoff + 180 * 60 * 1000;

    if (m.status === "live") return true;
    if (m.status === "finished" && nowMs - kickoff < tournamentWindowMs) return true;
    if (m.status === "scheduled" && nowMs > kickoff && nowMs < matchEnd + tournamentWindowMs) {
      return true;
    }
  }

  return false;
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

/** Golden Boot from synced goal events — fixes stale/partial topscorers API totals. */
export async function syncGoldenBootFromMatchEvents(
  supabase: SupabaseClient,
): Promise<number> {
  const [{ data: events }, { data: teams }] = await Promise.all([
    supabase
      .from("match_events")
      .select("player_name, team_api_id, event_type, detail")
      .eq("event_type", "Goal"),
    supabase.from("teams").select("id, api_football_team_id, golden_boot_goals, golden_boot_player_name"),
  ]);

  const teamByApiId = new Map<number, string>();
  for (const t of teams ?? []) {
    if (t.api_football_team_id != null) {
      teamByApiId.set(t.api_football_team_id, t.id);
    }
  }

  const goalsByPlayerTeam = new Map<string, { teamId: string; name: string; goals: number }>();

  for (const ev of events ?? []) {
    if (!isCountableBootGoal(ev.detail)) continue;
    if (!ev.team_api_id || !ev.player_name) continue;
    const teamId = teamByApiId.get(ev.team_api_id);
    if (!teamId) continue;

    const key = `${teamId}:${ev.player_name}`;
    const cur = goalsByPlayerTeam.get(key) ?? { teamId, name: ev.player_name, goals: 0 };
    cur.goals += 1;
    goalsByPlayerTeam.set(key, cur);
  }

  const bestByTeam = new Map<string, { name: string; goals: number }>();
  for (const row of goalsByPlayerTeam.values()) {
    const prev = bestByTeam.get(row.teamId);
    if (!prev || row.goals > prev.goals) {
      bestByTeam.set(row.teamId, { name: row.name, goals: row.goals });
    }
  }

  let updated = 0;
  for (const team of teams ?? []) {
    const fromEvents = bestByTeam.get(team.id);
    const currentGoals = team.golden_boot_goals ?? 0;
    const currentName = team.golden_boot_player_name;

    let nextName = currentName;
    let nextGoals = currentGoals;

    if (fromEvents) {
      if (fromEvents.goals > nextGoals) {
        nextGoals = fromEvents.goals;
        nextName = fromEvents.name;
      } else if (fromEvents.goals === nextGoals && fromEvents.name && !nextName) {
        nextName = fromEvents.name;
      }
    }

    if (nextGoals > 0 && nextName && (nextGoals !== currentGoals || nextName !== currentName)) {
      const { error } = await supabase
        .from("teams")
        .update({
          golden_boot_player_name: nextName,
          golden_boot_goals: nextGoals,
          awards_synced_at: new Date().toISOString(),
        })
        .eq("id", team.id);
      if (!error) updated++;
    }
  }

  return updated;
}

async function fetchAllTopscorers(
  apiKey: string,
  leagueId: string,
  season: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= 20) {
    const res = await fetch(
      `${API_BASE}/players/topscorers?league=${leagueId}&season=${season}&page=${page}`,
      { headers: apiHeaders(apiKey) },
    );
    if (!res.ok) break;

    const payload = await res.json();
    const paging = payload.paging as { current?: number; total?: number } | undefined;
    totalPages = paging?.total ?? 1;

    const rows = (payload.response as Record<string, unknown>[] | undefined) ?? [];
    if (!rows.length) break;

    all.push(...rows);
    page++;
  }

  return all;
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
  const rows = await fetchAllTopscorers(apiKey, leagueId, season);
  const bestByTeam = new Map<number, { name: string; goals: number }>();

  for (const row of rows) {
    const player = row.player as Record<string, unknown> | undefined;
    const stats = pickLeagueStats(
      row.statistics as Record<string, unknown>[] | undefined,
      leagueId,
    );
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
    const { data: teamRows } = await supabase
      .from("teams")
      .select("id, golden_boot_goals")
      .eq("api_football_team_id", apiTeamId);

    for (const t of teamRows ?? []) {
      const goals = Math.max(scorer.goals, t.golden_boot_goals ?? 0);
      const { error } = await supabase
        .from("teams")
        .update({
          golden_boot_player_name: scorer.name,
          golden_boot_goals: goals,
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

/** Lightweight awards refresh after a match (~2 API calls + DB event counts). */
export async function syncAwardsAfterMatch(
  supabase: SupabaseClient,
  apiKey: string,
  leagueId: string,
  season: string,
): Promise<{
  scorers: number;
  bootFromEvents: number;
  cleanSheets: number;
}> {
  const scorers = await syncTopScorersByTeam(supabase, apiKey, leagueId, season);
  const bootFromEvents = await syncGoldenBootFromMatchEvents(supabase);
  const cleanSheets = await syncCleanSheetsFromMatchResults(supabase);
  return { scorers, bootFromEvents, cleanSheets };
}

export async function syncTournamentAwards(
  supabase: SupabaseClient,
  apiKey: string,
  leagueId: string,
  season: string,
): Promise<{
  teamIds: number;
  scorers: number;
  bootFromEvents: number;
  goalkeepers: number;
  cleanSheets: number;
  expectedTeams: number;
}> {
  const { count } = await supabase.from("teams").select("id", { count: "exact", head: true });
  const expectedTeams = count ?? 48;
  const teamIds = await syncApiFootballTeamIds(supabase, apiKey, leagueId, season);
  const scorers = await syncTopScorersByTeam(supabase, apiKey, leagueId, season);
  const bootFromEvents = await syncGoldenBootFromMatchEvents(supabase);
  const goalkeepers = await syncGoalkeepersByTeam(supabase, apiKey, leagueId, season);
  const cleanSheets = await syncCleanSheetsFromMatchResults(supabase);
  return { teamIds, scorers, bootFromEvents, goalkeepers, cleanSheets, expectedTeams };
}
