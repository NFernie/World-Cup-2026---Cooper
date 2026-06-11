/**
 * Persist club + national lineup grids in app_settings (no repeat API fetches).
 * Key: spin_draft_position_cache
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const POSITION_CACHE_KEY = "spin_draft_position_cache";

export type LineupCacheEntry = {
  fetchedAt: string;
  codes: Record<string, string>;
  /** API returned fixtures/lineups but no usable grid — skip re-fetch for this season. */
  exhausted?: boolean;
};

export type PositionCache = {
  season: string;
  clubs: Record<string, LineupCacheEntry>;
  nations: Record<string, LineupCacheEntry>;
};

function emptyCache(season: string): PositionCache {
  return { season, clubs: {}, nations: {} };
}

export async function loadPositionCache(
  supabase: SupabaseClient,
  season: string,
): Promise<PositionCache> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", POSITION_CACHE_KEY)
    .maybeSingle();

  const raw = (data?.value ?? {}) as Partial<PositionCache>;
  if (raw.season === season) {
    return {
      season,
      clubs: { ...(raw.clubs ?? {}) },
      nations: { ...(raw.nations ?? {}) },
    };
  }
  return emptyCache(season);
}

export async function savePositionCache(
  supabase: SupabaseClient,
  cache: PositionCache,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("app_settings")
    .upsert(
      { key: POSITION_CACHE_KEY, value: cache, updated_at: now },
      { onConflict: "key" },
    );
}

function entryToMap(entry: LineupCacheEntry | undefined): Map<number, string> | null {
  if (!entry?.codes) return null;
  const codes = new Map<number, string>();
  for (const [id, code] of Object.entries(entry.codes)) {
    const n = parseInt(id, 10);
    if (Number.isFinite(n) && code) codes.set(n, code);
  }
  return codes.size > 0 ? codes : null;
}

export function getCachedClubCodes(
  cache: PositionCache,
  clubTeamId: number,
): Map<number, string> | null {
  return entryToMap(cache.clubs[String(clubTeamId)]);
}

export function getCachedNationCodes(
  cache: PositionCache,
  apiTeamId: number,
): Map<number, string> | null {
  return entryToMap(cache.nations[String(apiTeamId)]);
}

export function isClubCacheExhausted(cache: PositionCache, clubTeamId: number): boolean {
  return cache.clubs[String(clubTeamId)]?.exhausted === true;
}

export function isNationCacheExhausted(cache: PositionCache, apiTeamId: number): boolean {
  return cache.nations[String(apiTeamId)]?.exhausted === true;
}

function mergeIntoBucket(
  bucket: Record<string, LineupCacheEntry>,
  key: string,
  newCodes: Map<number, string>,
  exhausted: boolean,
): void {
  const prev = bucket[key];
  const merged: Record<string, string> = { ...(prev?.codes ?? {}) };
  for (const [id, code] of newCodes) {
    merged[String(id)] = code;
  }
  bucket[key] = {
    fetchedAt: new Date().toISOString(),
    codes: merged,
    exhausted: exhausted && Object.keys(merged).length === 0,
  };
}

export function mergeClubIntoCache(
  cache: PositionCache,
  clubTeamId: number,
  newCodes: Map<number, string>,
  exhausted: boolean,
): void {
  mergeIntoBucket(cache.clubs, String(clubTeamId), newCodes, exhausted);
}

export function mergeNationIntoCache(
  cache: PositionCache,
  apiTeamId: number,
  newCodes: Map<number, string>,
  exhausted: boolean,
): void {
  mergeIntoBucket(cache.nations, String(apiTeamId), newCodes, exhausted);
}
