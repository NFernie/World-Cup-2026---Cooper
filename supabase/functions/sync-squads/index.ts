/**
 * Import World Cup 2026 national-team squads + derived ratings into public.squad_players.
 * Env: API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: API_FOOTBALL_SEASON (default 2026)
 * Optional: API_FOOTBALL_FRIENDLIES_LEAGUE_ID (default 10 — International Friendlies)
 *
 * POST body (all optional):
 *   { "force": true }           — bypass once-per-day guard
 *   { "includeRatings": true }  — 2025 baselines (best-of-tier: national/UCL/domestic/club)
 *   { "rebaseline": true }      — re-fetch all non-manual players (use with includeRatings)
 *   { "topTeamsByFifaRank": 10 } — phased rebaseline for top N FIFA nations only
 *   { "includePositions": true } — only players with position_code IS NULL
 *   { "useWorldCupLineups": true } — national WC lineups only; zero club API (during tournament)
 *   { "allowNationalPositions": true } — legacy friendlies fallback when not using WC mode
 * Env: WC_POSITION_MAX_NATIONS_PER_RUN (default 10), API_FOOTBALL_WC_LEAGUE_ID (default 1)
 * Env: POSITION_SYNC_MAX_API_CLUBS (default 5) — live API fetches per run
 *   { "status": true }          — return last sync metadata only (fast health check)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSyncStatus, syncSquads } from "./_shared/squad-sync.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Accept true, "true", "1", 1 — PowerShell / query strings often send strings. */
function parseBool(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

type SyncResult = {
  skipped?: boolean;
  errors?: number;
  players?: number;
  withApiRating?: number;
  withPositionCode?: number;
  ratingsBudgetReached?: boolean;
  budgetReached?: boolean;
};

/** HTTP 500 on partial progress made Supabase log EDGE_FUNCTION_ERROR — treat progress as 200. */
function syncHttpStatus(result: SyncResult): { ok: boolean; status: number; partial?: boolean } {
  if (result.skipped === true) return { ok: true, status: 200 };
  const progress = (result.players ?? 0) > 0 || (result.withApiRating ?? 0) > 0 ||
    (result.withPositionCode ?? 0) > 0;
  const partial = result.ratingsBudgetReached === true ||
    result.budgetReached === true ||
    (result.errors ?? 0) > 0;
  if (progress) return { ok: true, status: 200, partial: partial || undefined };
  if ((result.errors ?? 0) > 0) return { ok: false, status: 500 };
  return { ok: true, status: 200 };
}

function parsePositiveInt(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function readPositiveInt(
  source: Record<string, unknown> | URLSearchParams,
  ...names: string[]
): number | undefined {
  if (source instanceof URLSearchParams) {
    for (const name of names) {
      const v = source.get(name);
      const n = parsePositiveInt(v);
      if (n != null) return n;
    }
    return undefined;
  }
  for (const [key, value] of Object.entries(source)) {
    if (names.some((n) => n.toLowerCase() === key.toLowerCase())) {
      const parsed = parsePositiveInt(value);
      if (parsed != null) return parsed;
    }
  }
  return undefined;
}

function readFlag(
  source: Record<string, unknown> | URLSearchParams,
  ...names: string[]
): boolean {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  if (source instanceof URLSearchParams) {
    for (const name of names) {
      const v = source.get(name);
      if (v != null && parseBool(v)) return true;
    }
    return false;
  }
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(key.toLowerCase()) && parseBool(value)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const hasQuery = [
      "force",
      "includeRatings",
      "includePositions",
      "rebaseline",
      "topTeamsByFifaRank",
      "useWorldCupLineups",
      "status",
    ].some((k) => url.searchParams.has(k));
    if (hasQuery) {
      // GET with ?force=true&includeRatings=true works from browser / curl without a body.
      const apiKey = Deno.env.get("API_FOOTBALL_KEY");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!apiKey || !supabaseUrl || !serviceKey) {
        return jsonResponse({ ok: false, error: "Missing env configuration" }, 500);
      }
      const season = Deno.env.get("API_FOOTBALL_SEASON") ?? "2026";
      const supabase = createClient(supabaseUrl, serviceKey);
      const opts = {
        force: readFlag(url.searchParams, "force"),
        includeRatings: readFlag(url.searchParams, "includeRatings", "include_ratings"),
        includePositions: readFlag(url.searchParams, "includePositions", "include_positions"),
        allowNationalPositions: readFlag(url.searchParams, "allowNationalPositions"),
        rebaseline: readFlag(url.searchParams, "rebaseline", "rebaseline_ratings"),
        topTeamsByFifaRank: readPositiveInt(url.searchParams, "topTeamsByFifaRank", "top_teams_by_fifa_rank"),
        useWorldCupLineups: readFlag(url.searchParams, "useWorldCupLineups", "use_world_cup_lineups"),
        statusOnly: readFlag(url.searchParams, "status"),
      };
      if (opts.statusOnly) {
        const status = await getSyncStatus(supabase);
        return jsonResponse({ ok: true, ...status, request: opts });
      }
      try {
        const result = await syncSquads(supabase, apiKey, season, opts);
        const { ok, status, partial } = syncHttpStatus(result);
        return jsonResponse({ ok, partial, request: opts, ...result }, status);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ ok: false, error: message, request: opts }, 500);
      }
    }
    return jsonResponse({
      ok: true,
      status: "ready",
      hint:
        'POST {"force":true,"includeRatings":true} or GET ?force=true&includeRatings=true&includePositions=true',
    });
  }

  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!apiKey || !supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "Missing env configuration" }, 500);
  }

  const url = new URL(req.url);
  let force = readFlag(url.searchParams, "force");
  let includeRatings = readFlag(url.searchParams, "includeRatings", "include_ratings");
  let includePositions = readFlag(url.searchParams, "includePositions", "include_positions");
  let allowNationalPositions = readFlag(url.searchParams, "allowNationalPositions");
  let rebaseline = readFlag(url.searchParams, "rebaseline");
  let topTeamsByFifaRank = readPositiveInt(url.searchParams, "topTeamsByFifaRank", "top_teams_by_fifa_rank");
  let useWorldCupLineups = readFlag(url.searchParams, "useWorldCupLineups", "use_world_cup_lineups");
  let statusOnly = readFlag(url.searchParams, "status");
  let bodyBytes = 0;
  let bodyParseError: string | undefined;

  try {
    const text = await req.text();
    bodyBytes = new TextEncoder().encode(text).length;
    if (text.trim()) {
      const body = JSON.parse(text) as Record<string, unknown>;
      force = readFlag(body, "force") || force;
      includeRatings = readFlag(body, "includeRatings", "include_ratings") || includeRatings;
      includePositions = readFlag(body, "includePositions", "include_positions") ||
        includePositions;
      allowNationalPositions = readFlag(body, "allowNationalPositions") ||
        allowNationalPositions;
      rebaseline = readFlag(body, "rebaseline", "rebaseline_ratings") || rebaseline;
      topTeamsByFifaRank = readPositiveInt(body, "topTeamsByFifaRank", "top_teams_by_fifa_rank") ??
        topTeamsByFifaRank;
      useWorldCupLineups = readFlag(body, "useWorldCupLineups", "use_world_cup_lineups") ||
        useWorldCupLineups;
      statusOnly = readFlag(body, "status") || statusOnly;
    }
  } catch (err) {
    bodyParseError = err instanceof Error ? err.message : String(err);
  }

  const request = {
    force,
    includeRatings,
    includePositions,
    allowNationalPositions,
    rebaseline,
    topTeamsByFifaRank,
    useWorldCupLineups,
    statusOnly,
    bodyBytes,
    bodyParseError,
  };

  const season = Deno.env.get("API_FOOTBALL_SEASON") ?? "2026";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    if (statusOnly) {
      const status = await getSyncStatus(supabase);
      return jsonResponse({ ok: true, ...status, request });
    }

    const result = await syncSquads(supabase, apiKey, season, {
      force,
      includeRatings,
      includePositions,
      allowNationalPositions,
      rebaseline,
      topTeamsByFifaRank,
      useWorldCupLineups,
    });
    const { ok, status, partial } = syncHttpStatus(result);
    return jsonResponse({ ok, partial, request, ...result }, status);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
