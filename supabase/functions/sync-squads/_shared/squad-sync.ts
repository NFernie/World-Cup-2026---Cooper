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
    await new Promise((r) => setTimeout(r, 120));
  } while (page <= totalPages && page <= 5);

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

export async function syncSquads(
  supabase: SupabaseClient,
  apiKey: string,
  season: string,
): Promise<{ teams: number; players: number; withApiRating: number }> {
  const { data: teams } = await supabase
    .from("teams")
    .select("id, api_football_team_id, fifa_code, global_fifa_rank")
    .not("api_football_team_id", "is", null);

  let teamsDone = 0;
  let playersUpserted = 0;
  let apiRated = 0;
  const now = new Date().toISOString();

  for (const team of (teams ?? []) as DbTeam[]) {
    const apiTeamId = team.api_football_team_id;
    if (!apiTeamId) continue;

    // 1. Roster from /players/squads
    const res = await fetch(`${API_BASE}/players/squads?team=${apiTeamId}`, {
      headers: apiHeaders(apiKey),
    });
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 120));
      continue;
    }
    const payload = await res.json();
    const squad = (payload.response?.[0]?.players ?? []) as Record<string, unknown>[];
    if (squad.length === 0) {
      await new Promise((r) => setTimeout(r, 120));
      continue;
    }

    // 2. Season ratings (may be empty pre-tournament)
    const ratings = await fetchSeasonRatings(apiKey, apiTeamId, season);

    const base = teamBaseRating(team.global_fifa_rank);
    const rows: SquadRow[] = [];

    for (const p of squad) {
      const id = (p.id as number | undefined) ?? null;
      const name = String(p.name ?? "").trim();
      if (!name) continue;
      const positionDetail = (p.position as string | null) ?? null;
      const position = normalizePosition(positionDetail);
      const apiRating = id != null ? ratings.get(id) : undefined;

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
        api_football_player_id: id,
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
      // Preserve manual overrides: do not clobber rows where rating_source = 'manual'.
      const { error } = await supabase
        .from("squad_players")
        .upsert(rows, { onConflict: "team_id,api_football_player_id" });
      if (!error) {
        playersUpserted += rows.length;
        teamsDone += 1;
      }
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  return { teams: teamsDone, players: playersUpserted, withApiRating: apiRated };
}
