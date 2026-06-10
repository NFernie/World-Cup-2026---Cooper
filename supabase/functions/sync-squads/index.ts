/**
 * Import World Cup 2026 national-team squads + derived ratings into public.squad_players.
 * Env: API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: API_FOOTBALL_SEASON (default 2026)
 * Optional: API_FOOTBALL_FRIENDLIES_LEAGUE_ID (default 10 — International Friendlies)
 *
 * POST body (all optional):
 *   { "force": true }           — bypass once-per-day guard
 *   { "includeRatings": true }  — 2025 domestic club baselines via /players?id= (slow)
 *   { "includePositions": true } — derive LB/ST/etc. from recent lineups (slow)
 *   { "status": true }          — return last sync metadata only (fast health check)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSyncStatus, syncSquads } from "./_shared/squad-sync.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return jsonResponse({
      ok: true,
      status: "ready",
      hint: 'POST {} for roster sync. {"force":true,"includeRatings":true} for 2025 baselines.',
    });
  }

  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!apiKey || !supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "Missing env configuration" }, 500);
  }

  let force = false;
  let includeRatings = false;
  let includePositions = false;
  let statusOnly = false;
  try {
    const text = await req.text();
    if (text.trim()) {
      const body = JSON.parse(text) as Record<string, unknown>;
      force = body.force === true;
      includeRatings = body.includeRatings === true;
      includePositions = body.includePositions === true;
      statusOnly = body.status === true;
    }
  } catch {
    // Empty or invalid body — use defaults (rosters only, respect daily guard).
  }

  const season = Deno.env.get("API_FOOTBALL_SEASON") ?? "2026";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    if (statusOnly) {
      const status = await getSyncStatus(supabase);
      return jsonResponse({ ok: true, ...status });
    }

    const result = await syncSquads(supabase, apiKey, season, {
      force,
      includeRatings,
      includePositions,
    });
    const ok = result.skipped === true || (result.errors ?? 0) === 0;
    return jsonResponse({ ok, ...result }, ok ? 200 : 500);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
