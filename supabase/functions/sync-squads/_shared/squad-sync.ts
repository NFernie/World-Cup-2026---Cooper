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
  fetchDomesticLineupPositionCode,
  fetchPlayerBaseline2025,
} from "./domestic-baseline.ts";
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
  baseline_club_api_team_id?: number | null;
  synced_at: string;
};

type ExistingPlayerRow = {
  api_football_player_id: number | null;
  overall_rating: number;
  rating_source: string;
  position_code: string | null;
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
  withUnrated: number;
  withPositionCode: number;
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

  const teams = (teamsResult.data ?? []) as DbTeam[];
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

  let teamsDone = 0;
  let playersUpserted = 0;
  let apiRated = 0;
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

  // Phase 1 — rosters for every nation.
  for (const team of teams) {
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

      const existingByPlayer = new Map<number, ExistingPlayerRow>();
      if (!includeRatings) {
        const { data: existingRows } = await supabase
          .from("squad_players")
          .select("api_football_player_id, overall_rating, rating_source, position_code")
          .eq("team_id", team.id);
        for (const ex of existingRows ?? []) {
          if (ex.api_football_player_id != null) {
            existingByPlayer.set(ex.api_football_player_id, ex as ExistingPlayerRow);
          }
        }
      }

      const rows: SquadRow[] = [];

      for (const p of roster) {
        let position = normalizePosition(p.positionDetail);
        const preserved = existingByPlayer.get(p.id);
        let overall = preserved?.overall_rating ?? 0;
        let source = preserved?.rating_source ?? "unrated";
        let clubTeamId: number | null = null;
        let positionCode = preserved?.position_code ?? null;

        if (preserved?.rating_source === "manual") {
          overall = preserved.overall_rating;
          source = "manual";
        } else if (includeRatings) {
          if (Date.now() - startedAt > budgetMs) {
            ratingsBudgetReached = true;
            break;
          }

          const baseline = await fetchPlayerBaseline2025(
            apiKey,
            p.id,
            baselineSeason,
            nationalApiTeamIds,
          );
          await new Promise((r) => setTimeout(r, 85));

          if (baseline) {
            overall = baseline.ovr;
            source = baseline.source;
            clubTeamId = baseline.clubTeamId;
            apiRated += 1;
            if (baseline.gamesPosition) {
              position = normalizePosition(baseline.gamesPosition);
            }
          } else {
            unrated += 1;
            source = "unrated";
            overall = preserved?.overall_rating ?? 0;
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

  // Phase 2 — position codes from domestic club lineups, then national friendlies.
  if (includePositions) {
    for (const team of teams) {
      if (Date.now() - startedAt > budgetMs) {
        budgetReached = true;
        break;
      }
      const apiTeamId = team.api_football_team_id;
      if (!apiTeamId) continue;
      let existing = rosterByTeam.get(team.id);
      if (!existing || existing.length === 0) {
        const { data: dbRows } = await supabase
          .from("squad_players")
          .select("*")
          .eq("team_id", team.id);
        existing = (dbRows ?? []) as SquadRow[];
      }
      if (existing.length === 0) continue;

      try {
        const nationalCodes = await fetchLineupPositionCodes(apiKey, apiTeamId, season);
        const updated: SquadRow[] = [];

        for (const row of existing) {
          let code = row.position_code;
          const playerId = row.api_football_player_id;
          const clubId = row.baseline_club_api_team_id ?? null;

          if (!code && playerId && clubId) {
            if (Date.now() - startedAt > budgetMs) {
              budgetReached = true;
              break;
            }
            const domesticCode = await fetchDomesticLineupPositionCode(
              apiKey,
              playerId,
              clubId,
              baselineSeason,
            );
            await new Promise((r) => setTimeout(r, 70));
            if (domesticCode) {
              code = domesticCode;
              positionCoded += 1;
            }
          }

          if (!code && playerId && nationalCodes.has(playerId)) {
            code = nationalCodes.get(playerId) ?? null;
            if (code) positionCoded += 1;
          }

          updated.push({ ...row, position_code: code, synced_at: now });
        }

        const upsertResult = await supabase
          .from("squad_players")
          .upsert(updated, { onConflict: "team_id,api_football_player_id" });
        if (upsertResult.error) {
          recordError(`${team.fifa_code} position upsert: ${upsertResult.error.message}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        recordError(`${team.fifa_code} positions: ${msg}`);
      }

      if (budgetReached) break;
      await new Promise((r) => setTimeout(r, 100));
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
      `Baseline ratings partial (${apiRated} set). Re-run {"force": true, "includeRatings": true} to continue — ~1 API call per player.`;
  } else if (budgetReached) {
    note = "Rosters synced; position enrichment hit time budget — will continue on next run.";
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
    withUnrated: unrated,
    withPositionCode: positionCoded,
    teamsAtFullSquad,
    errors,
    errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    ratingsBudgetReached: ratingsBudgetReached || undefined,
    includeRatings,
    includePositions,
    baselineSeason,
    note,
  };
}
