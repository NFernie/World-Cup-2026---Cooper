/**
 * Baseline player ratings from API-Football GET /players?id=&season=2025.
 * Prefers the domestic league row with the most minutes (e.g. Robertson PL 6.74).
 * Position codes (LB, ST, …) from recent club fixture lineups in that season.
 */
import { gridToPositionCode } from "./position-grid.ts";

const API_BASE = "https://v3.football.api-sports.io";

/** Top-tier domestic leagues (API-Football league ids). */
export const DOMESTIC_LEAGUE_IDS = new Set([
  39, // Premier League
  40, // Championship (ENG tier 2 — still domestic league football)
  140, // La Liga
  141, // Segunda
  78, // Bundesliga
  79, // 2. Bundesliga
  135, // Serie A
  136, // Serie B
  61, // Ligue 1
  62, // Ligue 2
  88, // Eredivisie
  89, // Eerste Divisie
  94, // Primeira Liga
  95, // Liga Portugal 2
  203, // Süper Lig
  253, // MLS
  71, // Brasileirão Série A
  72, // Brasileirão Série B
  128, // Liga Profesional Argentina
  262, // Liga MX
  98, // J1 League
  292, // K League 1
  207, // Super League Greece
  144, // Belgian Pro League
  179, // Scottish Premiership
  218, // Austrian Bundesliga
  119, // Danish Superliga
  169, // Superettan / Allsvenskan region — Allsvenskan
  113, // Allsvenskan
  103, // Eliteserien
  106, // Ekstraklasa
  210, // HNL Croatia
  286, // Serbian Super Liga
  283, // Romanian Liga I
  333, // Ukrainian Premier League
  235, // Russian Premier League
  307, // Saudi Pro League
  188, // A-League
  274, // South African Premiership
  197, // Egyptian Premier League
  305, // Qatar Stars League
  301, // UAE Pro League
]);

/** Cups, super cups, continental club — not domestic league baseline. */
const NON_DOMESTIC_LEAGUE_IDS = new Set([
  2, // UEFA Champions League
  3, // UEFA Europa League
  45, // FA Cup
  48, // League Cup
  528, // Community Shield
  667, // Friendlies Clubs
  10, // International Friendlies (national)
  1, // World Cup
  4, // European Championship
  9, // Copa America
  5, // UEFA Nations League
]);

export type PlayerBaseline = {
  rating: number;
  ovr: number;
  source: "domestic_2025" | "club_2025" | "national_2025";
  clubTeamId: number | null;
  clubName: string | null;
  leagueName: string | null;
  gamesPosition: string | null;
  minutes: number;
};

type ApiStat = {
  team: { id: number; name: string };
  league: { id: number; name: string; season?: number };
  games: {
    minutes?: number | null;
    rating?: string | number | null;
    position?: string | null;
  };
};

function parseRating(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseMinutes(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isNationalTeamStat(stat: ApiStat, nationalApiTeamIds: Set<number>): boolean {
  return nationalApiTeamIds.has(stat.team.id) ||
    stat.league.id === 10 ||
    stat.league.id === 1;
}

/**
 * Pick baseline from statistics[] on GET /players?id=&season=2025.
 * 1) Domestic league — highest minutes row
 * 2) Other club competitions (exclude cups/friendlies) — highest minutes
 * 3) National team appearances in 2025
 */
export function pickBaselineFromStatistics(
  stats: ApiStat[],
  nationalApiTeamIds: Set<number>,
  minMinutes = 45,
): PlayerBaseline | null {
  const eligible = stats
    .map((s) => {
      const minutes = parseMinutes(s.games?.minutes);
      const rating = parseRating(s.games?.rating);
      if (!rating || minutes < minMinutes) return null;
      return {
        stat: s,
        minutes,
        rating,
        leagueId: s.league.id,
        isDomestic: DOMESTIC_LEAGUE_IDS.has(s.league.id),
        isExcluded: NON_DOMESTIC_LEAGUE_IDS.has(s.league.id),
        isNational: isNationalTeamStat(s, nationalApiTeamIds),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (eligible.length === 0) return null;

  const domestic = eligible.filter((e) => e.isDomestic && !e.isNational);
  if (domestic.length > 0) {
    const best = domestic.sort((a, b) => b.minutes - a.minutes)[0];
    return toBaseline(best.stat, best.rating, best.minutes, "domestic_2025");
  }

  const club = eligible.filter((e) => !e.isNational && !e.isExcluded);
  if (club.length > 0) {
    const best = club.sort((a, b) => b.minutes - a.minutes)[0];
    return toBaseline(best.stat, best.rating, best.minutes, "club_2025");
  }

  const national = eligible.filter((e) => e.isNational);
  if (national.length > 0) {
    const best = national.sort((a, b) => b.minutes - a.minutes)[0];
    return toBaseline(best.stat, best.rating, best.minutes, "national_2025");
  }

  return null;
}

function toBaseline(
  stat: ApiStat,
  rating: number,
  minutes: number,
  source: PlayerBaseline["source"],
): PlayerBaseline {
  const ovr = Math.max(50, Math.min(94, Math.round(rating * 10)));
  return {
    rating,
    ovr,
    source,
    clubTeamId: source === "national_2025" ? null : stat.team.id,
    clubName: stat.team.name,
    leagueName: stat.league.name,
    gamesPosition: stat.games?.position ?? null,
    minutes,
  };
}

export async function fetchPlayerBaseline2025(
  apiKey: string,
  playerId: number,
  baselineSeason: string,
  nationalApiTeamIds: Set<number>,
): Promise<PlayerBaseline | null> {
  const res = await fetch(
    `${API_BASE}/players?id=${playerId}&season=${baselineSeason}`,
    { headers: { "x-apisports-key": apiKey } },
  );
  if (!res.ok) return null;

  const payload = await res.json().catch(() => null);
  const row = (payload?.response ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const stats = (row.statistics ?? []) as ApiStat[];
  return pickBaselineFromStatistics(stats, nationalApiTeamIds);
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

function parseLineupPlayerCodes(lineup: Record<string, unknown>): Map<number, string> {
  const codes = new Map<number, string>();
  const formation = String(lineup.formation ?? "");
  const startXI = (lineup.startXI ?? []) as Record<string, unknown>[];
  if (!formation || startXI.length === 0) return codes;

  for (const entry of startXI) {
    const player = entry.player as Record<string, unknown> | undefined;
    const id = player?.id as number | undefined;
    if (!id || codes.has(id)) continue;
    const pos = String(player?.pos ?? "");
    const grid = player?.grid as string | null | undefined;
    const code = gridToPositionCode(formation, pos, grid);
    if (code) codes.set(id, code);
  }
  return codes;
}

/**
 * LB/ST/etc. for many squad players at once — one fixtures call + lineups per club.
 * (~5 API calls per club instead of ~7 per player.)
 */
export async function fetchClubLineupPositionCodes(
  apiKey: string,
  clubTeamId: number,
  season: string,
  targetPlayerIds?: Set<number>,
  maxFixtures = 4,
): Promise<{ codes: Map<number, string>; apiCalls: number }> {
  const codes = new Map<number, string>();
  let apiCalls = 0;

  const fixturesRes = await fetch(
    `${API_BASE}/fixtures?team=${clubTeamId}&season=${season}&last=${maxFixtures}`,
    { headers: { "x-apisports-key": apiKey } },
  );
  apiCalls += 1;
  if (!fixturesRes.ok) return { codes, apiCalls };

  const fixtureIds = extractFixtureIds(await fixturesRes.json().catch(() => null));

  const allTargetsFound = () => {
    if (!targetPlayerIds || targetPlayerIds.size === 0) return false;
    for (const id of targetPlayerIds) {
      if (!codes.has(id)) return false;
    }
    return true;
  };

  for (const fixtureId of fixtureIds) {
    const lineupsRes = await fetch(
      `${API_BASE}/fixtures/lineups?fixture=${fixtureId}&team=${clubTeamId}`,
      { headers: { "x-apisports-key": apiKey } },
    );
    apiCalls += 1;
    if (!lineupsRes.ok) continue;

    const payload = await lineupsRes.json().catch(() => null);
    const response = (payload?.response ?? []) as Record<string, unknown>[];
    const lineup = response.find(
      (r) => (r.team as Record<string, unknown> | undefined)?.id === clubTeamId,
    ) ?? response[0];
    if (!lineup) continue;

    for (const [id, code] of parseLineupPlayerCodes(lineup)) {
      if (targetPlayerIds && !targetPlayerIds.has(id)) continue;
      if (!codes.has(id)) codes.set(id, code);
    }

    if (allTargetsFound()) break;
    await new Promise((r) => setTimeout(r, 45));
  }

  return { codes, apiCalls };
}

/** Single-player helper — prefer fetchClubLineupPositionCodes for batches. */
export async function fetchDomesticLineupPositionCode(
  apiKey: string,
  playerId: number,
  clubTeamId: number,
  season: string,
  maxFixtures = 4,
): Promise<string | null> {
  const { codes } = await fetchClubLineupPositionCodes(
    apiKey,
    clubTeamId,
    season,
    new Set([playerId]),
    maxFixtures,
  );
  return codes.get(playerId) ?? null;
}
