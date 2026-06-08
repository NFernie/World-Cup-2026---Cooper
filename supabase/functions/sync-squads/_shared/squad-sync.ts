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

type SquadRow = {
  team_id: string;
  api_football_player_id: number | null;
  name: string;
  position: string;
  position_detail: string | null;
  shirt_number: number | null;
  photo_url: string | null;
  overall_rating: number;
  rating_source: string;
  synced_at: string;
};

const SYNC_META_KEY = "spin_draft_sync";
const MIN_HOURS_BETWEEN_SYNCS = 20;
const DEFAULT_BUDGET_MS = 110_000;

export async function syncSquads(
  supabase: SupabaseClient,
  apiKey: string,
  season: string,
  opts: { force?: boolean; budgetMs?: number } = {},
): Promise<{
  teams: number;
  players: number;
  withApiRating: number;
  errors: number;
  skipped?: boolean;
  lastSyncedAt?: string;
  note?: string;
}> {
  const force = opts.force === true;
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();

  // Once-per-day guard: avoid hammering the football API. Manual runs can force.
  const metaResult = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SYNC_META_KEY)
    .maybeSingle();
  const lastSyncedAt = (metaResult?.data?.value as { last_synced_at?: string } | null)
    ?.last_synced_at;
  if (!force && lastSyncedAt) {
    const ageHours = (Date.now() - new Date(lastSyncedAt).getTime()) / 3_600_000;
    if (ageHours < MIN_HOURS_BETWEEN_SYNCS) {
      return {
        teams: 0,
        players: 0,
        withApiRating: 0,
        errors: 0,
        skipped: true,
        lastSyncedAt,
        note: `Already synced ${ageHours.toFixed(1)}h ago (min ${MIN_HOURS_BETWEEN_SYNCS}h). Pass {"force": true} to override.`,
      };
    }
  }

  const teamsResult = await supabase
    .from("teams")
    .select("id, api_football_team_id, fifa_code, global_fifa_rank")
    .not("api_football_team_id", "is", null);

  if (teamsResult?.error) {
    return { teams: 0, players: 0, withApiRating: 0, errors: 1, note: teamsResult.error.message };
  }

  const teams = (teamsResult?.data ?? []) as DbTeam[];
  if (teams.length === 0) {
    return {
      teams: 0,
      players: 0,
      withApiRating: 0,
      errors: 0,
      note: "No teams have api_football_team_id yet — run sync-tournament-awards first.",
    };
  }

  let teamsDone = 0;
  let playersUpserted = 0;
  let apiRated = 0;
  let errors = 0;
  let budgetReached = false;
  const now = new Date().toISOString();

  for (const team of teams) {
    if (Date.now() - startedAt > budgetMs) {
      budgetReached = true;
      break;
    }
    const apiTeamId = team.api_football_team_id;
    if (!apiTeamId) continue;

    try {
      // 1. Roster from /players/squads
      const res = await fetch(`${API_BASE}/players/squads?team=${apiTeamId}`, {
        headers: apiHeaders(apiKey),
      });
      if (!res.ok) {
        errors += 1;
        await new Promise((r) => setTimeout(r, 120));
        continue;
      }
      const payload = await res.json().catch(() => null);
      const squad = (payload?.response?.[0]?.players ?? []) as Record<string, unknown>[];
      if (!Array.isArray(squad) || squad.length === 0) {
        await new Promise((r) => setTimeout(r, 120));
        continue;
      }

      // 2. Season ratings (may be empty pre-tournament)
      const ratings = await fetchSeasonRatings(apiKey, apiTeamId, season);

      const base = teamBaseRating(team.global_fifa_rank);
      const rows: SquadRow[] = [];
      const seenIds = new Set<number>();

      for (const p of squad) {
        const rawId = (p.id as number | undefined) ?? null;
        // Skip duplicate or null ids to keep the onConflict upsert safe.
        if (rawId == null || seenIds.has(rawId)) continue;
        seenIds.add(rawId);

        const name = String(p.name ?? "").trim();
        if (!name) continue;
        const positionDetail = (p.position as string | null) ?? null;
        const position = normalizePosition(positionDetail);
        const apiRating = ratings.get(rawId);

        let overall: number;
        let source: string;
        if (apiRating != null) {
          overall = clamp(Math.round(apiRating * 10), 50, 94);
          source = "api";
          apiRated += 1;
        } else {
          overall = clamp(base + nameOffset(name), 52, 90);
          source = "fallback";
        }

        rows.push({
          team_id: team.id,
          api_football_player_id: rawId,
          name,
          position,
          position_detail: positionDetail,
          shirt_number: (p.number as number | null) ?? null,
          photo_url: (p.photo as string | null) ?? null,
          overall_rating: overall,
          rating_source: source,
          synced_at: now,
        });
      }

      if (rows.length > 0) {
        const upsertResult = await supabase
          .from("squad_players")
          .upsert(rows, { onConflict: "team_id,api_football_player_id" });
        if (upsertResult?.error) {
          errors += 1;
        } else {
          playersUpserted += rows.length;
          teamsDone += 1;
        }
      }
    } catch (_err) {
      errors += 1;
    }

    await new Promise((r) => setTimeout(r, 120));
  }

  // Only record the daily timestamp when the full set completed, so a
  // budget-truncated run lets the next invocation continue.
  if (!budgetReached) {
    await supabase
      .from("app_settings")
      .upsert(
        { key: SYNC_META_KEY, value: { last_synced_at: now }, updated_at: now },
        { onConflict: "key" },
      );
  }

  return {
    teams: teamsDone,
    players: playersUpserted,
    withApiRating: apiRated,
    errors,
    note: budgetReached
      ? "Time budget reached — run again (or wait for cron) to finish remaining teams."
      : undefined,
  };
}
