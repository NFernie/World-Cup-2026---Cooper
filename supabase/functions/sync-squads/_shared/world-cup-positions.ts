/**
 * National-team position codes from World Cup / WC-season fixtures.
 * One lineup ≈ 11 players — far cheaper than per-club domestic lookups.
 */
import { gridToPositionCode } from "./position-grid.ts";

const API_BASE = "https://v3.football.api-sports.io";

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

function parseLineupCodes(lineup: Record<string, unknown>): Map<number, string> {
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
 * Fetch position codes from national-team WC / season lineups.
 * Priority: WC league fixtures → any WC-season FT → last 3 national fixtures.
 */
export async function fetchWorldCupNationalLineupCodes(
  apiKey: string,
  apiTeamId: number,
  season: string,
  targetPlayerIds?: Set<number>,
  maxLineupAttempts = 3,
): Promise<{ codes: Map<number, string>; apiCalls: number }> {
  const codes = new Map<number, string>();
  let apiCalls = 0;
  const wcLeagueId = Deno.env.get("API_FOOTBALL_WC_LEAGUE_ID") ?? "1";
  const headers = { "x-apisports-key": apiKey };

  let fixtureIds: number[] = [];

  const wcRes = await fetch(
    `${API_BASE}/fixtures?league=${wcLeagueId}&season=${season}&team=${apiTeamId}&status=FT&last=${maxLineupAttempts}`,
    { headers },
  );
  apiCalls += 1;
  if (wcRes.ok) {
    fixtureIds = extractFixtureIds(await wcRes.json().catch(() => null));
  }

  if (fixtureIds.length === 0) {
    const seasonRes = await fetch(
      `${API_BASE}/fixtures?team=${apiTeamId}&season=${season}&status=FT&last=${maxLineupAttempts}`,
      { headers },
    );
    apiCalls += 1;
    if (seasonRes.ok) {
      fixtureIds = extractFixtureIds(await seasonRes.json().catch(() => null));
    }
  }

  if (fixtureIds.length === 0) {
    const lastRes = await fetch(`${API_BASE}/fixtures?team=${apiTeamId}&last=3`, { headers });
    apiCalls += 1;
    if (lastRes.ok) {
      fixtureIds = extractFixtureIds(await lastRes.json().catch(() => null));
    }
  }

  const allTargetsFound = () => {
    if (!targetPlayerIds || targetPlayerIds.size === 0) return false;
    for (const id of targetPlayerIds) {
      if (!codes.has(id)) return false;
    }
    return true;
  };

  let lineupAttempts = 0;
  for (const fixtureId of fixtureIds) {
    if (lineupAttempts >= maxLineupAttempts) break;

    const lineupsRes = await fetch(
      `${API_BASE}/fixtures/lineups?fixture=${fixtureId}&team=${apiTeamId}`,
      { headers },
    );
    apiCalls += 1;
    lineupAttempts += 1;
    if (!lineupsRes.ok) continue;

    const payload = await lineupsRes.json().catch(() => null);
    const response = (payload?.response ?? []) as Record<string, unknown>[];
    const lineup = response.find(
      (r) => (r.team as Record<string, unknown> | undefined)?.id === apiTeamId,
    ) ?? response[0];
    if (!lineup) continue;

    for (const [id, code] of parseLineupCodes(lineup)) {
      if (targetPlayerIds && !targetPlayerIds.has(id)) continue;
      if (!codes.has(id)) codes.set(id, code);
    }

    if (allTargetsFound()) break;
    await new Promise((r) => setTimeout(r, 40));
  }

  return { codes, apiCalls };
}
