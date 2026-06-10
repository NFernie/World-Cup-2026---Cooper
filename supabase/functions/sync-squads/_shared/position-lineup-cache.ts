/**
 * Persist club lineup grids in app_settings so we never re-fetch the same club.
 * Key: spin_draft_position_cache
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const POSITION_CACHE_KEY = "spin_draft_position_cache";

export type ClubCacheEntry = {
  fetchedAt: string;
  codes: Record<string, string>;
  /** API returned fixtures/lineups but no usable grid — skip re-fetch for this season. */
  exhausted?: boolean;
};

export type PositionCache = {
  season: string;
  clubs: Record<string, ClubCacheEntry>;
};

export async function loadPositionCache(
  supabase: SupabaseClient,
  season: string,
): Promise<PositionCache> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", POSITION_CACHE_KEY)
    .maybeSingle();

  const raw = (data?.value ?? {}) as PositionCache;
  if (raw.season === season && raw.clubs && typeof raw.clubs === "object") {
    return { season, clubs: { ...raw.clubs } };
  }
  return { season, clubs: {} };
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

export function getCachedClubCodes(
  cache: PositionCache,
  clubTeamId: number,
): Map<number, string> | null {
  const entry = cache.clubs[String(clubTeamId)];
  if (!entry?.codes) return null;
  const codes = new Map<number, string>();
  for (const [id, code] of Object.entries(entry.codes)) {
    const n = parseInt(id, 10);
    if (Number.isFinite(n) && code) codes.set(n, code);
  }
  return codes;
}

export function isClubCacheExhausted(cache: PositionCache, clubTeamId: number): boolean {
  return cache.clubs[String(clubTeamId)]?.exhausted === true;
}

export function mergeClubIntoCache(
  cache: PositionCache,
  clubTeamId: number,
  newCodes: Map<number, string>,
  exhausted: boolean,
): void {
  const key = String(clubTeamId);
  const prev = cache.clubs[key];
  const merged: Record<string, string> = { ...(prev?.codes ?? {}) };
  for (const [id, code] of newCodes) {
    merged[String(id)] = code;
  }
  cache.clubs[key] = {
    fetchedAt: new Date().toISOString(),
    codes: merged,
    exhausted: exhausted && Object.keys(merged).length === 0,
  };
}
