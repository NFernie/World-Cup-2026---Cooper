/**
 * Baseline player ratings from API-Football GET /players?id=&season=2025.
 * Priority (Phase 2): national → UCL/UEL → top domestic → other club.
 * Position codes (LB, ST, …) from recent club fixture lineups in that season.
 */
import { gridToPositionCode } from "./position-grid.ts";

const API_BASE = "https://v3.football.api-sports.io";

/** UEFA continental club competitions — preferred over domestic for star presence. */
export const CONTINENTAL_LEAGUE_IDS = new Set([
  2, // UEFA Champions League
  3, // UEFA Europa League
  848, // UEFA Europa Conference League
]);

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

/** Cups, friendlies, international tournaments — excluded from generic club tier. */
const EXCLUDED_LEAGUE_IDS = new Set([
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

export type BaselineRatingSource =
  | "national_2025"
  | "continental_2025"
  | "domestic_2025"
  | "club_2025";

export type PlayerBaseline = {
  rating: number;
  ovr: number;
  source: BaselineRatingSource;
  clubTeamId: number | null;
  leagueId: number | null;
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

function pickBestByMinutes(
  entries: { stat: ApiStat; rating: number; minutes: number }[],
): { stat: ApiStat; rating: number; minutes: number } | null {
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b.minutes - a.minutes)[0];
}

type EligibleStat = {
  stat: ApiStat;
  minutes: number;
  rating: number;
  leagueId: number;
  isNational: boolean;
  isContinental: boolean;
  isDomestic: boolean;
  isExcluded: boolean;
};

function buildEligibleStats(
  stats: ApiStat[],
  nationalApiTeamIds: Set<number>,
  minMinutes: number,
): EligibleStat[] {
  return stats
    .map((s) => {
      const minutes = parseMinutes(s.games?.minutes);
      const rating = parseRating(s.games?.rating);
      if (!rating || minutes < minMinutes) return null;
      const leagueId = s.league.id;
      const isNational = isNationalTeamStat(s, nationalApiTeamIds);
      return {
        stat: s,
        minutes,
        rating,
        leagueId,
        isNational,
        isContinental: CONTINENTAL_LEAGUE_IDS.has(leagueId),
        isDomestic: DOMESTIC_LEAGUE_IDS.has(leagueId),
        isExcluded: EXCLUDED_LEAGUE_IDS.has(leagueId),
      };
    })
    .filter((x): x is EligibleStat => x != null);
}

export function hasContinentalRatingInStatistics(
  stats: ApiStat[],
  nationalApiTeamIds: Set<number>,
  minMinutes = 45,
): boolean {
  return buildEligibleStats(stats, nationalApiTeamIds, minMinutes).some(
    (e) => e.isContinental && !e.isNational,
  );
}

/**
 * Pick baseline from statistics[] — highest API rating across national, continental,
 * domestic, and other club tiers (best-of-tier).
 */
export function pickBaselineFromStatistics(
  stats: ApiStat[],
  nationalApiTeamIds: Set<number>,
  minMinutes = 45,
): PlayerBaseline | null {
  const eligible = buildEligibleStats(stats, nationalApiTeamIds, minMinutes);
  if (eligible.length === 0) return null;

  const tiers: { entries: EligibleStat[]; source: BaselineRatingSource }[] = [
    {
      entries: eligible.filter((e) => e.isNational),
      source: "national_2025",
    },
    {
      entries: eligible.filter((e) => e.isContinental && !e.isNational),
      source: "continental_2025",
    },
    {
      entries: eligible.filter((e) => e.isDomestic && !e.isNational && !e.isContinental),
      source: "domestic_2025",
    },
    {
      entries: eligible.filter((e) => !e.isNational && !e.isExcluded && !e.isContinental),
      source: "club_2025",
    },
  ];

  let best: { entry: EligibleStat; source: BaselineRatingSource } | null = null;
  for (const tier of tiers) {
    const pick = pickBestByMinutes(tier.entries);
    if (!pick) continue;
    if (!best || pick.rating > best.entry.rating) {
      best = { entry: pick, source: tier.source };
    }
  }

  if (!best) return null;
  return toBaseline(
    best.entry.stat,
    best.entry.rating,
    best.entry.minutes,
    best.source,
  );
}

export type PlayerBaselineResult = {
  baseline: PlayerBaseline | null;
  hasContinentalRating: boolean;
};

export function pickPlayerBaselineFromStatistics(
  stats: ApiStat[],
  nationalApiTeamIds: Set<number>,
  minMinutes = 45,
): PlayerBaselineResult {
  return {
    baseline: pickBaselineFromStatistics(stats, nationalApiTeamIds, minMinutes),
    hasContinentalRating: hasContinentalRatingInStatistics(
      stats,
      nationalApiTeamIds,
      minMinutes,
    ),
  };
}

function toBaseline(
  stat: ApiStat,
  rating: number,
  minutes: number,
  source: BaselineRatingSource,
): PlayerBaseline {
  const ovr = Math.max(50, Math.min(94, Math.round(rating * 10)));
  return {
    rating,
    ovr,
    source,
    clubTeamId: source === "national_2025" ? null : stat.team.id,
    leagueId: stat.league.id,
    clubName: stat.team.name,
    leagueName: stat.league.name,
    gamesPosition: stat.games?.position ?? null,
    minutes,
  };
}

async function fetchPlayerStatistics2025(
  apiKey: string,
  playerId: number,
  baselineSeason: string,
): Promise<ApiStat[] | null> {
  const res = await fetch(
    `${API_BASE}/players?id=${playerId}&season=${baselineSeason}`,
    { headers: { "x-apisports-key": apiKey } },
  );
  if (!res.ok) return null;

  const payload = await res.json().catch(() => null);
  const row = (payload?.response ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  return (row.statistics ?? []) as ApiStat[];
}

export async function fetchPlayerBaseline2025(
  apiKey: string,
  playerId: number,
  baselineSeason: string,
  nationalApiTeamIds: Set<number>,
): Promise<PlayerBaseline | null> {
  const stats = await fetchPlayerStatistics2025(apiKey, playerId, baselineSeason);
  if (!stats) return null;
  return pickBaselineFromStatistics(stats, nationalApiTeamIds);
}

export async function fetchPlayerBaselineWithMeta2025(
  apiKey: string,
  playerId: number,
  baselineSeason: string,
  nationalApiTeamIds: Set<number>,
): Promise<PlayerBaselineResult> {
  const stats = await fetchPlayerStatistics2025(apiKey, playerId, baselineSeason);
  if (!stats) {
    return { baseline: null, hasContinentalRating: false };
  }
  return pickPlayerBaselineFromStatistics(stats, nationalApiTeamIds);
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
/** Min API: 1 fixtures + up to 2 lineup calls; returns full XI for cache storage. */
export async function fetchClubLineupPositionCodes(
  apiKey: string,
  clubTeamId: number,
  season: string,
  _targetPlayerIds?: Set<number>,
  maxLineupAttempts = 2,
): Promise<{ codes: Map<number, string>; apiCalls: number }> {
  const codes = new Map<number, string>();
  let apiCalls = 0;

  const fixturesRes = await fetch(
    `${API_BASE}/fixtures?team=${clubTeamId}&season=${season}&last=1`,
    { headers: { "x-apisports-key": apiKey } },
  );
  apiCalls += 1;
  if (!fixturesRes.ok) return { codes, apiCalls };

  const fixtureIds = extractFixtureIds(await fixturesRes.json().catch(() => null));
  let attempts = 0;

  for (const fixtureId of fixtureIds) {
    if (attempts >= maxLineupAttempts) break;
    attempts += 1;

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
      if (!codes.has(id)) codes.set(id, code);
    }

    if (codes.size > 0) break;
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
