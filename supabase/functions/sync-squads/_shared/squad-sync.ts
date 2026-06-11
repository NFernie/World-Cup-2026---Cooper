/**
 * Sync World Cup 2026 national-team squads from API-Football into public.squad_players.
 *
 * Baseline ratings (tournament-fixed until form system is added):
 *   GET /players?id={id}&season=2025
 *   → domestic league row with most minutes (e.g. Robertson PL 6.74 → OVR 67)
 *   → else best club row → else national 2025
 *   rating_source: domestic_2025 | club_2025 | national_2025 | manual
 *
 * Position codes: recent club lineups in baseline season, else national friendlies.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  fetchClubLineupPositionCodes,
  fetchPlayerBaselineWithMeta2025,
} from "./domestic-baseline.ts";
import { playerFallbackRating } from "./rating-fallback.ts";
import {
  getCachedClubCodes,
  getCachedNationCodes,
  isClubCacheExhausted,
  isNationCacheExhausted,
  loadPositionCache,
  mergeClubIntoCache,
  mergeNationIntoCache,
  savePositionCache,
} from "./position-lineup-cache.ts";
import { fetchWorldCupNationalLineupCodes } from "./world-cup-positions.ts";
import { gridToPositionCode } from "./position-grid.ts";

const API_BASE = "https://v3.football.api-sports.io";

type DbTeam = {
  id: string;
  api_football_team_id: number | null;
  fifa_code: string;
  global_fifa_rank: number | null;
};

function apiHeaders(apiKey: string) {
  return { "x-apisports-key": apiKey };
}

function normalizePosition(raw: string | null | undefined): string {
  const p = String(raw ?? "").toLowerCase();
  if (p.startsWith("goal") || p === "gk" || p === "g") return "GK";
  if (p.startsWith("def") || p === "d") return "DEF";
  if (p.startsWith("mid") || p === "m") return "MID";
  if (p.startsWith("att") || p.startsWith("for") || p === "f" || p === "a") return "FWD";
  return "MID";
}

type RosterPlayer = {
  id: number;
  name: string;
  positionDetail: string | null;
  shirtNumber: number | null;
  photoUrl: string | null;
};

/** Current squad from /players/squads (API's registered national-team roster). */
async function fetchSquadsRoster(
  apiKey: string,
  apiTeamId: number,
): Promise<RosterPlayer[]> {
  const res = await fetch(`${API_BASE}/players/squads?team=${apiTeamId}`, {
    headers: apiHeaders(apiKey),
  });
  if (!res.ok) return [];
  const payload = await res.json().catch(() => null);
  const squad = (payload?.response?.[0]?.players ?? []) as Record<string, unknown>[];
  if (!Array.isArray(squad)) return [];

  const players: RosterPlayer[] = [];
  for (const p of squad) {
    const id = p.id as number | undefined;
    const name = String(p.name ?? "").trim();
    if (!id || !name) continue;
    players.push({
      id,
      name,
      positionDetail: (p.position as string | null) ?? null,
      shirtNumber: (p.number as number | null) ?? null,
      photoUrl: (p.photo as string | null) ?? null,
    });
  }
  return players;
}

/**
 * WC season roster from /players?team=&season= — often has the full 26-man list
 * after FIFA squad submission even when /players/squads is still thin.
 */
async function fetchSeasonRoster(
  apiKey: string,
  apiTeamId: number,
  season: string,
): Promise<RosterPlayer[]> {
  const players: RosterPlayer[] = [];
  const seen = new Set<number>();
  let page = 1;
  let totalPages = 1;

  do {
    const res = await fetch(
      `${API_BASE}/players?team=${apiTeamId}&season=${season}&page=${page}`,
      { headers: apiHeaders(apiKey) },
    );
    if (!res.ok) break;
    const payload = await res.json();
    totalPages = payload?.paging?.total ?? 1;

    for (const row of payload.response ?? []) {
      const player = row.player as Record<string, unknown> | undefined;
      const stats = (row.statistics as Record<string, unknown>[] | undefined) ?? [];
      const id = player?.id as number | undefined;
      const name = String(player?.name ?? "").trim();
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);

      const stat = stats[0] as Record<string, unknown> | undefined;
      const games = stat?.games as Record<string, unknown> | undefined;
      players.push({
        id,
        name,
        positionDetail: (games?.position as string | null) ??
          (player?.position as string | null) ?? null,
        shirtNumber: (games?.number as number | null) ?? null,
        photoUrl: (player?.photo as string | null) ?? null,
      });
    }

    page += 1;
    await new Promise((r) => setTimeout(r, 80));
  } while (page <= totalPages && page <= 5);

  return players;
}

/** Prefer the larger of squads vs season roster (target ~26 after FIFA deadline). */
async function fetchBestRoster(
  apiKey: string,
  apiTeamId: number,
  season: string,
): Promise<{ players: RosterPlayer[]; source: "squads" | "season" | "both" }> {
  const squads = await fetchSquadsRoster(apiKey, apiTeamId);
  await new Promise((r) => setTimeout(r, 80));

  // After FIFA's 1 June deadline, season endpoint should have the full WC squad.
  if (squads.length >= 22) {
    return { players: squads, source: "squads" };
  }

  const seasonRoster = await fetchSeasonRoster(apiKey, apiTeamId, season);
  if (seasonRoster.length > squads.length) {
    return { players: seasonRoster, source: "season" };
  }
  if (squads.length > 0) {
    return { players: squads, source: "squads" };
  }
  return { players: seasonRoster, source: seasonRoster.length > 0 ? "season" : "squads" };
}

function extractFixtureIds(payload: Record<string, unknown> | null): number[] {
  const rows = (payload?.response ?? []) as Record<string, unknown>[];
  const ids: number[] = [];
  for (const row of rows) {
    const fixture = row.fixture as Record<string, unknown> | undefined;
    const id = fixture?.id as number | undefined;
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Collect recent fixture ids for a national team — any competition plus
 * explicit International Friendlies (league 10 on API-Sports v3).
 */
async function collectPositionFixtureIds(
  apiKey: string,
  apiTeamId: number,
  opts: { friendliesLeagueId: string; seasons: string[] },
): Promise<{ fixtureIds: number[]; apiCalls: number }> {
  const seen = new Set<number>();
  const ordered: number[] = [];
  let apiCalls = 0;

  const addIds = (ids: number[]) => {
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
  };

  for (const season of opts.seasons) {
    const res = await fetch(
      `${API_BASE}/fixtures?league=${opts.friendliesLeagueId}&season=${season}&team=${apiTeamId}&status=FT&last=5`,
      { headers: apiHeaders(apiKey) },
    );
    apiCalls += 1;
    if (res.ok) {
      addIds(extractFixtureIds(await res.json().catch(() => null)));
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  const anyRes = await fetch(`${API_BASE}/fixtures?team=${apiTeamId}&last=10`, {
    headers: apiHeaders(apiKey),
  });
  apiCalls += 1;
  if (anyRes.ok) {
    addIds(extractFixtureIds(await anyRes.json().catch(() => null)));
  }

  return { fixtureIds: ordered, apiCalls };
}

/** Infer LB/ST/etc. from recent national-team lineups. */
async function fetchLineupPositionCodes(
  apiKey: string,
  apiTeamId: number,
  season: string,
  targetPlayerIds?: Set<number>,
): Promise<{ codes: Map<number, string>; apiCalls: number }> {
  const codes = new Map<number, string>();
  let apiCalls = 0;
  const friendliesLeagueId = Deno.env.get("API_FOOTBALL_FRIENDLIES_LEAGUE_ID") ?? "10";
  const priorSeason = String(parseInt(season, 10) - 1);
  const { fixtureIds, apiCalls: fixtureCalls } = await collectPositionFixtureIds(
    apiKey,
    apiTeamId,
    { friendliesLeagueId, seasons: [season, priorSeason] },
  );
  apiCalls += fixtureCalls;

  const allTargetsFound = () => {
    if (!targetPlayerIds || targetPlayerIds.size === 0) return false;
    for (const id of targetPlayerIds) {
      if (!codes.has(id)) return false;
    }
    return true;
  };

  for (const fixtureId of fixtureIds) {
    const lineupsRes = await fetch(
      `${API_BASE}/fixtures/lineups?fixture=${fixtureId}&team=${apiTeamId}`,
      { headers: apiHeaders(apiKey) },
    );
    apiCalls += 1;
    if (!lineupsRes.ok) continue;

    const lineupsPayload = await lineupsRes.json().catch(() => null);
    const response = (lineupsPayload?.response ?? []) as Record<string, unknown>[];
    const lineup = response.find(
      (r) => (r.team as Record<string, unknown> | undefined)?.id === apiTeamId,
    ) ?? response[0] ?? null;
    if (!lineup) continue;

    const formation = String(lineup.formation ?? "");
    const startXI = (lineup.startXI ?? []) as Record<string, unknown>[];
    if (!formation || startXI.length === 0) continue;

    for (const entry of startXI) {
      const player = entry.player as Record<string, unknown> | undefined;
      const id = player?.id as number | undefined;
      if (!id || codes.has(id)) continue;
      if (targetPlayerIds && !targetPlayerIds.has(id)) continue;
      const pos = String(player?.pos ?? "");
      const grid = player?.grid as string | null | undefined;
      const code = gridToPositionCode(formation, pos, grid);
      if (code) codes.set(id, code);
    }

    if (allTargetsFound() || (!targetPlayerIds && codes.size >= 8)) break;
  }

  return { codes, apiCalls };
}

type SquadRow = {
  team_id: string;
  api_football_player_id: number | null;
  name: string;
  position: string;
  position_code: string | null;
  position_detail: string | null;
  shirt_number: number | null;
  photo_url: string | null;
  overall_rating: number;
  rating_source: string;
  baseline_club_api_team_id?: number | null;
  baseline_league_id?: number | null;
  has_continental_rating?: boolean;
  synced_at: string;
};

type ExistingPlayerRow = {
  api_football_player_id: number | null;
  overall_rating: number;
  rating_source: string;
  position_code: string | null;
  baseline_club_api_team_id: number | null;
  baseline_league_id: number | null;
  has_continental_rating: boolean | null;
};

function topTeamsByFifaRank(teams: DbTeam[], limit: number): DbTeam[] {
  return [...teams]
    .filter((t) => t.global_fifa_rank != null && t.global_fifa_rank > 0)
    .sort((a, b) => a.global_fifa_rank! - b.global_fifa_rank!)
    .slice(0, limit);
}

const SYNC_META_KEY = "spin_draft_sync";
const MIN_HOURS_BETWEEN_SYNCS = 20;
/** Legacy sources still needing GET /players?id=&season=2025 migration. */
const LEGACY_RATING_SOURCES = new Set(["api", "fallback"]);
/** Already migrated — skip per-player API call on subsequent runs. */
const BASELINE_RATING_SOURCES = new Set([
  "domestic_2025",
  "club_2025",
  "national_2025",
  "continental_2025",
  "fallback_2025",
  "manual",
]);

function needsBaselineRating(source: string | null | undefined): boolean {
  if (!source) return true;
  return LEGACY_RATING_SOURCES.has(source) || source === "unrated";
}

function shouldFetchPlayerBaseline(
  source: string | null | undefined,
  rebaseline: boolean,
): boolean {
  if (source === "manual") return false;
  if (rebaseline) return true;
  if (!source || needsBaselineRating(source)) return true;
  return !BASELINE_RATING_SOURCES.has(source);
}

function syncBudgetMs(includeRatings: boolean, includePositions: boolean): number {
  // Positions-only must stay short — long runs hit WORKER_RESOURCE_LIMIT.
  if (includePositions && !includeRatings) {
    const pos = Deno.env.get("POSITION_SYNC_BUDGET_MS");
    const n = pos ? parseInt(pos, 10) : 45_000;
    return Number.isFinite(n) && n > 5_000 ? Math.min(n, 55_000) : 45_000;
  }
  const raw = Deno.env.get("API_FOOTBALL_SYNC_BUDGET_MS");
  const n = raw ? parseInt(raw, 10) : 120_000;
  return Number.isFinite(n) && n > 10_000 ? Math.min(n, 150_000) : 120_000;
}

function maxApiClubsPerRun(): number {
  const n = parseInt(Deno.env.get("POSITION_SYNC_MAX_API_CLUBS") ?? "5", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 5;
}

function maxNationalTeamsPerRun(): number {
  const n = parseInt(Deno.env.get("POSITION_SYNC_MAX_NATIONAL") ?? "0", 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 3) : 0;
}

function maxNationsPerWcRun(): number {
  const n = parseInt(Deno.env.get("WC_POSITION_MAX_NATIONS_PER_RUN") ?? "10", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 10;
}

async function applyPositionCode(
  supabase: SupabaseClient,
  playerDbId: string,
  code: string,
  now: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("squad_players")
    .update({ position_code: code, synced_at: now })
    .eq("id", playerDbId)
    .is("position_code", null);
  return !error;
}

type PositionPending = {
  id: string;
  api_football_player_id: number;
  baseline_club_api_team_id: number | null;
  team_id: string;
};

function safeOverallRating(value: number | null | undefined, fallback = 62): number {
  const n = value ?? fallback;
  return Math.max(1, Math.min(99, n));
}

export async function getSyncStatus(supabase: SupabaseClient): Promise<{
  lastSyncedAt: string | null;
  squadPlayerCount: number;
}> {
  const [metaResult, countResult] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", SYNC_META_KEY).maybeSingle(),
    supabase.from("squad_players").select("id", { count: "exact", head: true }),
  ]);

  if (metaResult.error) {
    throw new Error(`Failed to read sync metadata: ${metaResult.error.message}`);
  }
  if (countResult.error) {
    throw new Error(`Failed to count squad players: ${countResult.error.message}`);
  }

  const lastSyncedAt =
    (metaResult.data?.value as { last_synced_at?: string } | null)?.last_synced_at ?? null;

  return { lastSyncedAt, squadPlayerCount: countResult.count ?? 0 };
}

export async function syncSquads(
  supabase: SupabaseClient,
  apiKey: string,
  season: string,
  opts: {
    force?: boolean;
    includeRatings?: boolean;
    includePositions?: boolean;
    allowNationalPositions?: boolean;
    rebaseline?: boolean;
    useWorldCupLineups?: boolean;
    /** Limit ratings rebaseline to the top N nations by FIFA rank (phased API use). */
    topTeamsByFifaRank?: number;
    budgetMs?: number;
  } = {},
): Promise<{
  teams: number;
  players: number;
  withApiRating: number;
  ratingsSkipped?: number;
  withUnrated: number;
  withPositionCode: number;
  positionsSkipped?: number;
  positionApiCalls?: number;
  clubsProcessed?: number;
  clubsFromCache?: number;
  clubsFetched?: number;
  nationsProcessed?: number;
  nationsFromCache?: number;
  nationsFetched?: number;
  useWorldCupLineups?: boolean;
  pendingPositions?: number;
  budgetMs?: number;
  teamsAtFullSquad: number;
  errors: number;
  errorDetails?: string[];
  ratingsBudgetReached?: boolean;
  skipped?: boolean;
  lastSyncedAt?: string;
  includeRatings?: boolean;
  includePositions?: boolean;
  baselineSeason?: string;
  note?: string;
}> {
  const force = opts.force === true;
  const includeRatings = opts.includeRatings === true;
  const includePositions = opts.includePositions === true;
  const allowNationalPositions = opts.allowNationalPositions === true;
  const rebaseline = opts.rebaseline === true;
  const useWorldCupLineups = opts.useWorldCupLineups === true;
  const topTeamsLimit = opts.topTeamsByFifaRank && opts.topTeamsByFifaRank > 0
    ? Math.floor(opts.topTeamsByFifaRank)
    : 0;
  const budgetMs = opts.budgetMs ?? syncBudgetMs(includeRatings, includePositions);
  const startedAt = Date.now();
  const positionsOnly = includePositions && !includeRatings;

  // Once-per-day guard: avoid hammering the football API. Manual runs can force.
  const metaResult = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SYNC_META_KEY)
    .maybeSingle();
  if (metaResult.error) {
    return {
      teams: 0,
      players: 0,
      withApiRating: 0,
      withUnrated: 0,
      withPositionCode: 0,
      teamsAtFullSquad: 0,
      errors: 1,
      includeRatings,
      includePositions,
      baselineSeason: Deno.env.get("API_FOOTBALL_BASELINE_SEASON") ?? "2025",
      note: `Failed to read sync metadata: ${metaResult.error.message}`,
    };
  }
  const lastSyncedAt = (metaResult.data?.value as { last_synced_at?: string } | null)
    ?.last_synced_at;
  if (!force && lastSyncedAt) {
    const ageHours = (Date.now() - new Date(lastSyncedAt).getTime()) / 3_600_000;
    if (ageHours < MIN_HOURS_BETWEEN_SYNCS) {
      return {
        teams: 0,
        players: 0,
        withApiRating: 0,
        withUnrated: 0,
        withPositionCode: 0,
        teamsAtFullSquad: 0,
        errors: 0,
        skipped: true,
        lastSyncedAt,
        includeRatings,
        includePositions,
        baselineSeason: Deno.env.get("API_FOOTBALL_BASELINE_SEASON") ?? "2025",
        note:
          `Already synced ${ageHours.toFixed(1)}h ago (min ${MIN_HOURS_BETWEEN_SYNCS}h). Pass force=true in JSON body, or use GET ?force=true&includeRatings=true (see request.bodyBytes — 0 means PowerShell did not send the body).`,
      };
    }
  }

  const teamsResult = await supabase
    .from("teams")
    .select("id, api_football_team_id, fifa_code, global_fifa_rank")
    .not("api_football_team_id", "is", null);

  if (teamsResult.error) {
    return {
      teams: 0,
      players: 0,
      withApiRating: 0,
      withUnrated: 0,
      withPositionCode: 0,
      teamsAtFullSquad: 0,
      errors: 1,
      includeRatings,
      includePositions,
      baselineSeason: Deno.env.get("API_FOOTBALL_BASELINE_SEASON") ?? "2025",
      note: teamsResult.error.message,
    };
  }

  let teams = (teamsResult.data ?? []) as DbTeam[];
  if (topTeamsLimit > 0 && includeRatings) {
    teams = topTeamsByFifaRank(teams, topTeamsLimit);
  }
  if (teams.length === 0) {
    return {
      teams: 0,
      players: 0,
      withApiRating: 0,
      withUnrated: 0,
      withPositionCode: 0,
      teamsAtFullSquad: 0,
      errors: 0,
      includeRatings,
      includePositions,
      baselineSeason: Deno.env.get("API_FOOTBALL_BASELINE_SEASON") ?? "2025",
      note: "No teams have api_football_team_id yet — run sync-tournament-awards first.",
    };
  }

  const baselineSeason = Deno.env.get("API_FOOTBALL_BASELINE_SEASON") ?? "2025";
  const nationalApiTeamIds = new Set(
    teams.map((t) => t.api_football_team_id).filter((id): id is number => id != null),
  );

  const existingByTeam = new Map<string, Map<number, ExistingPlayerRow>>();
  if (includeRatings) {
    const { data: allExisting } = await supabase
      .from("squad_players")
      .select(
        "team_id, api_football_player_id, overall_rating, rating_source, position_code, baseline_club_api_team_id, baseline_league_id, has_continental_rating",
      );
    for (const row of allExisting ?? []) {
      const teamId = row.team_id as string;
      const playerId = row.api_football_player_id as number | null;
      if (!teamId || playerId == null) continue;
      if (!existingByTeam.has(teamId)) existingByTeam.set(teamId, new Map());
      existingByTeam.get(teamId)!.set(playerId, row as ExistingPlayerRow);
    }
  }

  if (includeRatings) {
    const pendingForTeam = (teamId: string) => {
      const players = existingByTeam.get(teamId);
      if (!players || players.size === 0) return 999;
      let n = 0;
      for (const p of players.values()) {
        if (needsBaselineRating(p.rating_source)) n += 1;
      }
      return n;
    };
    teams = [...teams].sort((a, b) => pendingForTeam(b.id) - pendingForTeam(a.id));
  }

  let teamsDone = 0;
  let playersUpserted = 0;
  let apiRated = 0;
  let ratingsSkipped = 0;
  let unrated = 0;
  let positionCoded = 0;
  let teamsAtFullSquad = 0;
  let errors = 0;
  const errorDetails: string[] = [];
  const recordError = (msg: string) => {
    errors += 1;
    if (errorDetails.length < 8) errorDetails.push(msg);
  };
  let budgetReached = false;
  let ratingsBudgetReached = false;
  const now = new Date().toISOString();
  const rosterByTeam = new Map<string, SquadRow[]>();

  // Phase 1 — rosters (skip entirely on positions-only runs).
  if (!positionsOnly) for (const team of teams) {
    const apiTeamId = team.api_football_team_id;
    if (!apiTeamId) continue;

    if (includeRatings && Date.now() - startedAt > budgetMs) {
      ratingsBudgetReached = true;
      break;
    }

    try {
      const { players: roster } = await fetchBestRoster(apiKey, apiTeamId, season);
      if (roster.length === 0) {
        recordError(`${team.fifa_code}: empty roster from API-Football`);
        continue;
      }
      if (roster.length >= 24) teamsAtFullSquad += 1;

      const existingByPlayer = existingByTeam.get(team.id) ?? new Map<number, ExistingPlayerRow>();
      if (!includeRatings && existingByPlayer.size === 0) {
        const { data: existingRows } = await supabase
          .from("squad_players")
          .select(
            "api_football_player_id, overall_rating, rating_source, position_code, baseline_club_api_team_id",
          )
          .eq("team_id", team.id);
        for (const ex of existingRows ?? []) {
          if (ex.api_football_player_id != null) {
            existingByPlayer.set(ex.api_football_player_id, ex as ExistingPlayerRow);
          }
        }
      }

      if (includeRatings && !includePositions && !rebaseline && existingByPlayer.size > 0) {
        let pending = 0;
        for (const p of existingByPlayer.values()) {
          if (shouldFetchPlayerBaseline(p.rating_source, false)) pending += 1;
        }
        if (pending === 0) continue;
      }

      const rows: SquadRow[] = [];

      for (const p of roster) {
        let position = normalizePosition(p.positionDetail);
        const preserved = existingByPlayer.get(p.id);
        let overall = safeOverallRating(preserved?.overall_rating);
        let source = preserved?.rating_source ?? "unrated";
        let clubTeamId = preserved?.baseline_club_api_team_id ?? null;
        let leagueId = preserved?.baseline_league_id ?? null;
        let hasContinentalRating = preserved?.has_continental_rating ?? false;
        let positionCode = preserved?.position_code ?? null;

        if (preserved?.rating_source === "manual") {
          overall = safeOverallRating(preserved.overall_rating);
          source = "manual";
        } else if (includeRatings) {
          const forceRebaseline = rebaseline || topTeamsLimit > 0;
          if (preserved && !shouldFetchPlayerBaseline(preserved.rating_source, forceRebaseline)) {
            ratingsSkipped += 1;
          } else {
            if (Date.now() - startedAt > budgetMs) {
              ratingsBudgetReached = true;
              break;
            }

            const result = await fetchPlayerBaselineWithMeta2025(
              apiKey,
              p.id,
              baselineSeason,
              nationalApiTeamIds,
            );
            await new Promise((r) => setTimeout(r, 85));

            hasContinentalRating = result.hasContinentalRating;
            if (result.baseline) {
              overall = result.baseline.ovr;
              source = result.baseline.source;
              clubTeamId = result.baseline.clubTeamId;
              leagueId = result.baseline.leagueId;
              apiRated += 1;
              if (result.baseline.gamesPosition) {
                position = normalizePosition(result.baseline.gamesPosition);
              }
            } else {
              overall = playerFallbackRating(team.global_fifa_rank, p.name);
              source = "fallback_2025";
              clubTeamId = null;
              leagueId = null;
              unrated += 1;
            }
          }
        }

        rows.push({
          team_id: team.id,
          api_football_player_id: p.id,
          name: p.name,
          position,
          position_code: positionCode,
          position_detail: p.positionDetail,
          shirt_number: p.shirtNumber,
          photo_url: p.photoUrl,
          overall_rating: overall,
          rating_source: source,
          baseline_club_api_team_id: clubTeamId,
          baseline_league_id: leagueId,
          has_continental_rating: hasContinentalRating,
          synced_at: now,
        });
      }

      if (ratingsBudgetReached && rows.length === 0) break;

      if (rows.length > 0) {
        const upsertResult = await supabase
          .from("squad_players")
          .upsert(rows, { onConflict: "team_id,api_football_player_id" });
        if (upsertResult.error) {
          recordError(`${team.fifa_code} upsert: ${upsertResult.error.message}`);
        } else {
          playersUpserted += rows.length;
          teamsDone += 1;
          rosterByTeam.set(team.id, rows);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordError(`${team.fifa_code}: ${msg}`);
    }

    if (ratingsBudgetReached) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  // Phase 2 — position codes: lightweight club batches with immediate DB writes.
  const ratingsPassComplete = !includeRatings || !ratingsBudgetReached;
  let positionsSkipped = 0;
  let positionApiCalls = 0;
  let clubsProcessed = 0;
  let clubsFromCache = 0;
  let clubsFetched = 0;
  let nationsProcessed = 0;
  let nationsFromCache = 0;
  let nationsFetched = 0;
  let pendingPositions = 0;

  if (includePositions && ratingsPassComplete) {
    const { count: codedCount } = await supabase
      .from("squad_players")
      .select("id", { count: "exact", head: true })
      .not("position_code", "is", null);
    positionsSkipped = codedCount ?? 0;

    const { count: pendingCount } = await supabase
      .from("squad_players")
      .select("id", { count: "exact", head: true })
      .is("position_code", null)
      .not("api_football_player_id", "is", null);
    pendingPositions = pendingCount ?? 0;

    if (pendingPositions === 0) {
      return {
        teams: teamsDone,
        players: playersUpserted,
        withApiRating: apiRated,
        ratingsSkipped: ratingsSkipped > 0 ? ratingsSkipped : undefined,
        withUnrated: unrated,
        budgetMs,
        withPositionCode: 0,
        positionsSkipped,
        pendingPositions: 0,
        teamsAtFullSquad,
        errors,
        errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
        ratingsBudgetReached: ratingsBudgetReached || undefined,
        positionsOnly: positionsOnly || undefined,
        useWorldCupLineups: useWorldCupLineups || undefined,
        includeRatings,
        includePositions,
        baselineSeason,
        note: "All squad players already have position_code — no API calls made.",
      };
    }

    const { data: pending } = await supabase
      .from("squad_players")
      .select("id, api_football_player_id, baseline_club_api_team_id, team_id")
      .is("position_code", null)
      .not("api_football_player_id", "is", null);

    if (pending && pending.length > 0) {
      const applyCodesToPlayers = async (
        players: PositionPending[],
        codes: Map<number, string>,
      ) => {
        for (const p of players) {
          const code = codes.get(p.api_football_player_id);
          if (!code) continue;
          if (await applyPositionCode(supabase, p.id, code, now)) positionCoded += 1;
        }
      };

      if (useWorldCupLineups) {
        const positionCache = await loadPositionCache(supabase, season);
        const teamsById = new Map(teams.map((t) => [t.id, t]));
        const byNational = new Map<string, PositionPending[]>();

        for (const row of pending) {
          const entry: PositionPending = {
            id: row.id as string,
            api_football_player_id: row.api_football_player_id as number,
            baseline_club_api_team_id: row.baseline_club_api_team_id as number | null,
            team_id: row.team_id as string,
          };
          if (!byNational.has(entry.team_id)) byNational.set(entry.team_id, []);
          byNational.get(entry.team_id)!.push(entry);
        }

        const nationsSorted = [...byNational.entries()].sort((a, b) => b[1].length - a[1].length);
        const needsApiFetch: Array<[number, string, PositionPending[]]> = [];

        for (const [teamId, nationPlayers] of nationsSorted) {
          const apiTeamId = teamsById.get(teamId)?.api_football_team_id;
          if (!apiTeamId) continue;

          if (isNationCacheExhausted(positionCache, apiTeamId)) {
            nationsProcessed += 1;
            continue;
          }

          const cached = getCachedNationCodes(positionCache, apiTeamId);
          if (cached && cached.size > 0) {
            nationsFromCache += 1;
            nationsProcessed += 1;
            await applyCodesToPlayers(nationPlayers, cached);
            continue;
          }

          needsApiFetch.push([apiTeamId, teamId, nationPlayers]);
        }

        let apiNationBudget = maxNationsPerWcRun();
        for (const [apiTeamId, _teamId, nationPlayers] of needsApiFetch) {
          if (apiNationBudget <= 0 || Date.now() - startedAt > budgetMs) {
            budgetReached = true;
            break;
          }
          apiNationBudget -= 1;

          const targetIds = new Set(nationPlayers.map((p) => p.api_football_player_id));
          const { codes, apiCalls } = await fetchWorldCupNationalLineupCodes(
            apiKey,
            apiTeamId,
            season,
            targetIds,
          );
          positionApiCalls += apiCalls;
          nationsFetched += 1;
          nationsProcessed += 1;

          mergeNationIntoCache(positionCache, apiTeamId, codes, codes.size === 0);

          if (codes.size > 0) {
            await applyCodesToPlayers(nationPlayers, codes);
          }

          await new Promise((r) => setTimeout(r, 30));
        }

        await savePositionCache(supabase, positionCache);
      } else {
        const positionCache = await loadPositionCache(supabase, baselineSeason);
        const byClub = new Map<number, PositionPending[]>();

        for (const row of pending) {
          const clubId = row.baseline_club_api_team_id as number | null;
          if (!clubId) continue;
          const entry: PositionPending = {
            id: row.id as string,
            api_football_player_id: row.api_football_player_id as number,
            baseline_club_api_team_id: clubId,
            team_id: row.team_id as string,
          };
          if (!byClub.has(clubId)) byClub.set(clubId, []);
          byClub.get(clubId)!.push(entry);
        }

        const clubsSorted = [...byClub.entries()].sort((a, b) => b[1].length - a[1].length);
        const needsApiFetch: Array<[number, PositionPending[]]> = [];

        for (const [clubId, clubPlayers] of clubsSorted) {
          if (isClubCacheExhausted(positionCache, clubId)) {
            clubsProcessed += 1;
            continue;
          }

          const cached = getCachedClubCodes(positionCache, clubId);
          if (cached && cached.size > 0) {
            clubsFromCache += 1;
            clubsProcessed += 1;
            await applyCodesToPlayers(clubPlayers, cached);
            continue;
          }

          needsApiFetch.push([clubId, clubPlayers]);
        }

        let apiClubBudget = maxApiClubsPerRun();
        for (const [clubId, clubPlayers] of needsApiFetch) {
          if (apiClubBudget <= 0 || Date.now() - startedAt > budgetMs) {
            budgetReached = true;
            break;
          }
          apiClubBudget -= 1;

          const { codes, apiCalls } = await fetchClubLineupPositionCodes(
            apiKey,
            clubId,
            baselineSeason,
          );
          positionApiCalls += apiCalls;
          clubsFetched += 1;
          clubsProcessed += 1;

          mergeClubIntoCache(positionCache, clubId, codes, codes.size === 0);

          if (codes.size > 0) {
            await applyCodesToPlayers(clubPlayers, codes);
          }

          await new Promise((r) => setTimeout(r, 30));
        }

        await savePositionCache(supabase, positionCache);

        const nationalCap = allowNationalPositions ? maxNationalTeamsPerRun() : 0;
        if (nationalCap > 0 && !budgetReached && Date.now() - startedAt < budgetMs - 6_000) {
        const { data: stillPending } = await supabase
          .from("squad_players")
          .select("id, api_football_player_id, team_id")
          .is("position_code", null)
          .not("api_football_player_id", "is", null)
          .limit(80);

        const byNational = new Map<string, PositionPending[]>();
        for (const row of stillPending ?? []) {
          const entry: PositionPending = {
            id: row.id as string,
            api_football_player_id: row.api_football_player_id as number,
            baseline_club_api_team_id: null,
            team_id: row.team_id as string,
          };
          if (!byNational.has(entry.team_id)) byNational.set(entry.team_id, []);
          byNational.get(entry.team_id)!.push(entry);
        }

        const teamsById = new Map(teams.map((t) => [t.id, t]));
        const nationalTeams = [...byNational.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, nationalCap);

        for (const [teamId, teamPlayers] of nationalTeams) {
          if (Date.now() - startedAt > budgetMs) {
            budgetReached = true;
            break;
          }
          const apiTeamId = teamsById.get(teamId)?.api_football_team_id;
          if (!apiTeamId) continue;

          const targetIds = new Set(teamPlayers.map((p) => p.api_football_player_id));
          const { codes: nationalCodes, apiCalls } = await fetchLineupPositionCodes(
            apiKey,
            apiTeamId,
            season,
            targetIds,
          );
          positionApiCalls += apiCalls;

          for (const p of teamPlayers) {
            const code = nationalCodes.get(p.api_football_player_id);
            if (!code) continue;
            if (await applyPositionCode(supabase, p.id, code, now)) positionCoded += 1;
          }
        }
        }
      }
    }
  }

  const rostersComplete = teamsDone >= teams.length && !ratingsBudgetReached;
  if (rostersComplete && !budgetReached) {
    await supabase
      .from("app_settings")
      .upsert(
        { key: SYNC_META_KEY, value: { last_synced_at: now }, updated_at: now },
        { onConflict: "key" },
      );
  }

  const expectedPlayers = 48 * 26;
  let note: string | undefined;
  if (ratingsBudgetReached) {
    note =
      `Baseline ratings partial (${apiRated} new, ${ratingsSkipped} already done). Re-run the same URL — teams with api/fallback players are prioritised.`;
  } else if (useWorldCupLineups && (budgetReached || positionCoded > 0)) {
    note =
      `WC position sync: ${positionCoded} coded (${nationsFromCache} nations from cache, ${nationsFetched} new API fetches, ~${positionApiCalls} API calls). Re-run ?force=true&includePositions=true&useWorldCupLineups=true — no club API.`;
  } else if (budgetReached || (positionsOnly && positionCoded > 0)) {
    note =
      `Position sync: ${positionCoded} coded (${clubsFromCache} clubs from cache, ${clubsFetched} new API fetches, ~${positionApiCalls} API calls). Re-run ?force=true&includePositions=true — cached clubs cost 0 API.`;
  } else if (unrated > 0) {
    note = `${unrated} players have no ${baselineSeason} club/national rating in API-Football.`;
  } else if (playersUpserted < expectedPlayers * 0.8) {
    note =
      `Only ${playersUpserted} players (expected ~${expectedPlayers}). Run {"force": true} after checking API squads for season ${season}.`;
  } else if (!includeRatings && !includePositions) {
    note = "Roster-only sync (existing ratings preserved). Pass {\"includeRatings\": true} for 2025 domestic baselines.";
  }

  return {
    teams: teamsDone,
    players: playersUpserted,
    withApiRating: apiRated,
    ratingsSkipped: ratingsSkipped > 0 ? ratingsSkipped : undefined,
    withUnrated: unrated,
    budgetMs,
    withPositionCode: positionCoded,
    positionsSkipped: positionsSkipped > 0 ? positionsSkipped : undefined,
    positionApiCalls: positionApiCalls > 0 ? positionApiCalls : undefined,
    clubsProcessed: clubsProcessed > 0 ? clubsProcessed : undefined,
    clubsFromCache: clubsFromCache > 0 ? clubsFromCache : undefined,
    clubsFetched: clubsFetched > 0 ? clubsFetched : undefined,
    nationsProcessed: nationsProcessed > 0 ? nationsProcessed : undefined,
    nationsFromCache: nationsFromCache > 0 ? nationsFromCache : undefined,
    nationsFetched: nationsFetched > 0 ? nationsFetched : undefined,
    useWorldCupLineups: useWorldCupLineups || undefined,
    pendingPositions: includePositions ? pendingPositions : undefined,
    teamsAtFullSquad,
    errors,
    errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    ratingsBudgetReached: ratingsBudgetReached || undefined,
    positionsOnly: positionsOnly || undefined,
    includeRatings,
    includePositions,
    baselineSeason,
    note,
  };
}
