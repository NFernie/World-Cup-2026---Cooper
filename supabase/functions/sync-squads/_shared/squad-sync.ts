/**
 * Sync World Cup 2026 national-team squads from API-Football into public.squad_players.
 *
 * Ratings strategy (no FUTBIN):
 *   1. If the player has an API-Football season rating (games.rating), use it:
 *        overall = clamp(round(rating * 10), 50, 94)   source = "api"
 *   2. Otherwise derive a baseline from the nation's FIFA ranking + a small
 *      deterministic per-player offset so squads have internal spread:
 *        overall = clamp(teamBase(fifaRank) + offset(name), 52, 90)  source = "fallback"
 *
 * Pre-tournament most players will only have rating 2 (fallback) because no World
 * Cup match has been played yet; this keeps the game playable from day one and
 * upgrades to real ratings automatically once matches are recorded.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
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

function parseFloatSafe(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Deterministic small offset (-4..+4) from a string so squads vary internally. */
function nameOffset(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return (hash % 9) - 4;
}

/** Baseline rating from FIFA rank: ~86 for #1 down to ~58 for the lowest seeds. */
function teamBaseRating(fifaRank: number | null): number {
  const rank = fifaRank ?? 50;
  const base = Math.round(86 - (rank - 1) * 0.32);
  return Math.max(58, Math.min(86, base));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
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

/** Average season rating per api player id from /players?team=&season= (paginated). */
async function fetchSeasonRatings(
  apiKey: string,
  apiTeamId: number,
  season: string,
): Promise<Map<number, number>> {
  const ratings = new Map<number, number>();
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
      if (!id) continue;

      let best: number | null = null;
      for (const s of stats) {
        const games = s.games as Record<string, unknown> | undefined;
        const r = parseFloatSafe(games?.rating);
        if (r != null && (best == null || r > best)) best = r;
      }
      if (best != null) ratings.set(id, best);
    }

    page += 1;
    await new Promise((r) => setTimeout(r, 80));
  } while (page <= totalPages && page <= 3);

  return ratings;
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
): Promise<number[]> {
  const seen = new Set<number>();
  const ordered: number[] = [];

  const addIds = (ids: number[]) => {
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
  };

  // 1. Recent friendlies (best pre-tournament source for lineup grids)
  for (const season of opts.seasons) {
    const res = await fetch(
      `${API_BASE}/fixtures?league=${opts.friendliesLeagueId}&season=${season}&team=${apiTeamId}&status=FT&last=5`,
      { headers: apiHeaders(apiKey) },
    );
    if (res.ok) {
      addIds(extractFixtureIds(await res.json().catch(() => null)));
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  // 2. Any recent national-team fixtures (qualifiers, Nations League, etc.)
  const anyRes = await fetch(`${API_BASE}/fixtures?team=${apiTeamId}&last=10`, {
    headers: apiHeaders(apiKey),
  });
  if (anyRes.ok) {
    addIds(extractFixtureIds(await anyRes.json().catch(() => null)));
  }

  return ordered;
}

/** Infer LB/ST/etc. from recent lineups (friendlies first, then any national fixture). */
async function fetchLineupPositionCodes(
  apiKey: string,
  apiTeamId: number,
  season: string,
): Promise<Map<number, string>> {
  const codes = new Map<number, string>();
  const friendliesLeagueId = Deno.env.get("API_FOOTBALL_FRIENDLIES_LEAGUE_ID") ?? "10";
  const priorSeason = String(parseInt(season, 10) - 1);
  const fixtureIds = await collectPositionFixtureIds(apiKey, apiTeamId, {
    friendliesLeagueId,
    seasons: [season, priorSeason],
  });

  for (const fixtureId of fixtureIds) {
    const lineupsRes = await fetch(
      `${API_BASE}/fixtures/lineups?fixture=${fixtureId}&team=${apiTeamId}`,
      { headers: apiHeaders(apiKey) },
    );
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
      const pos = String(player?.pos ?? "");
      const grid = player?.grid as string | null | undefined;
      const code = gridToPositionCode(formation, pos, grid);
      if (code) codes.set(id, code);
    }

    if (codes.size >= 8) break;
  }

  return codes;
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
  synced_at: string;
};

const SYNC_META_KEY = "spin_draft_sync";
const MIN_HOURS_BETWEEN_SYNCS = 20;
/** Stay under the platform edge-function wall (~60s) so the Dashboard always gets JSON. */
const DEFAULT_BUDGET_MS = 50_000;

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
    budgetMs?: number;
  } = {},
): Promise<{
  teams: number;
  players: number;
  withApiRating: number;
  withPositionCode: number;
  teamsAtFullSquad: number;
  errors: number;
  skipped?: boolean;
  lastSyncedAt?: string;
  includeRatings?: boolean;
  includePositions?: boolean;
  note?: string;
}> {
  const force = opts.force === true;
  const includeRatings = opts.includeRatings === true;
  const includePositions = opts.includePositions === true;
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();

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
      withPositionCode: 0,
      teamsAtFullSquad: 0,
      errors: 1,
      includeRatings,
      includePositions,
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
        withPositionCode: 0,
        teamsAtFullSquad: 0,
        errors: 0,
        skipped: true,
        lastSyncedAt,
        includeRatings,
        includePositions,
        note: `Already synced ${ageHours.toFixed(1)}h ago (min ${MIN_HOURS_BETWEEN_SYNCS}h). Pass {"force": true} to override.`,
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
      withPositionCode: 0,
      teamsAtFullSquad: 0,
      errors: 1,
      includeRatings,
      includePositions,
      note: teamsResult.error.message,
    };
  }

  const teams = (teamsResult.data ?? []) as DbTeam[];
  if (teams.length === 0) {
    return {
      teams: 0,
      players: 0,
      withApiRating: 0,
      withPositionCode: 0,
      teamsAtFullSquad: 0,
      errors: 0,
      includeRatings,
      includePositions,
      note: "No teams have api_football_team_id yet — run sync-tournament-awards first.",
    };
  }

  let teamsDone = 0;
  let playersUpserted = 0;
  let apiRated = 0;
  let positionCoded = 0;
  let teamsAtFullSquad = 0;
  let errors = 0;
  let budgetReached = false;
  const now = new Date().toISOString();
  const rosterByTeam = new Map<string, SquadRow[]>();

  // Phase 1 — rosters for every nation (no position calls; must complete all 48).
  for (const team of teams) {
    const apiTeamId = team.api_football_team_id;
    if (!apiTeamId) continue;

    try {
      const { players: roster } = await fetchBestRoster(apiKey, apiTeamId, season);
      if (roster.length === 0) {
        errors += 1;
        continue;
      }
      if (roster.length >= 24) teamsAtFullSquad += 1;

      const ratings = includeRatings
        ? await fetchSeasonRatings(apiKey, apiTeamId, season)
        : new Map<number, number>();

      const base = teamBaseRating(team.global_fifa_rank);
      const rows: SquadRow[] = [];

      for (const p of roster) {
        const position = normalizePosition(p.positionDetail);
        const apiRating = ratings.get(p.id);

        let overall: number;
        let source: string;
        if (apiRating != null) {
          overall = clamp(Math.round(apiRating * 10), 50, 94);
          source = "api";
          apiRated += 1;
        } else {
          overall = clamp(base + nameOffset(p.name), 52, 90);
          source = "fallback";
        }

        rows.push({
          team_id: team.id,
          api_football_player_id: p.id,
          name: p.name,
          position,
          position_code: null,
          position_detail: p.positionDetail,
          shirt_number: p.shirtNumber,
          photo_url: p.photoUrl,
          overall_rating: overall,
          rating_source: source,
          synced_at: now,
        });
      }

      if (rows.length > 0) {
        const upsertResult = await supabase
          .from("squad_players")
          .upsert(rows, { onConflict: "team_id,api_football_player_id" });
        if (upsertResult.error) {
          errors += 1;
        } else {
          playersUpserted += rows.length;
          teamsDone += 1;
          rosterByTeam.set(team.id, rows);
        }
      }
    } catch (_err) {
      errors += 1;
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  // Phase 2 — position codes (optional; may truncate on time budget).
  if (includePositions) {
    for (const team of teams) {
      if (Date.now() - startedAt > budgetMs) {
        budgetReached = true;
        break;
      }
      const apiTeamId = team.api_football_team_id;
      if (!apiTeamId) continue;
      const existing = rosterByTeam.get(team.id);
      if (!existing || existing.length === 0) continue;

      try {
        const lineupCodes = await fetchLineupPositionCodes(apiKey, apiTeamId, season);
        if (lineupCodes.size === 0) continue;

        const updated = existing.map((row) => {
          const playerId = row.api_football_player_id ?? -1;
          const code = lineupCodes.get(playerId) ?? row.position_code;
          if (lineupCodes.has(playerId)) positionCoded += 1;
          return { ...row, position_code: code, synced_at: now };
        });

        const upsertResult = await supabase
          .from("squad_players")
          .upsert(updated, { onConflict: "team_id,api_football_player_id" });
        if (upsertResult.error) errors += 1;
      } catch (_err) {
        errors += 1;
      }

      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const rostersComplete = teamsDone >= teams.length;
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
  if (budgetReached) {
    note = "Rosters synced; position enrichment hit time budget — will continue tomorrow.";
  } else if (playersUpserted < expectedPlayers * 0.8) {
    note =
      `Only ${playersUpserted} players (expected ~${expectedPlayers}). Run {"force": true} after checking API has 26-man squads for season ${season}.`;
  } else if (!includeRatings && !includePositions) {
    note = "Roster-only sync. Pass {\"includeRatings\": true} or {\"includePositions\": true} for enrichment.";
  }

  return {
    teams: teamsDone,
    players: playersUpserted,
    withApiRating: apiRated,
    withPositionCode: positionCoded,
    teamsAtFullSquad,
    errors,
    includeRatings,
    includePositions,
    note,
  };
}
