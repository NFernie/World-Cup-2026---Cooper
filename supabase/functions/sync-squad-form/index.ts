/**
 * Daily WC match form sync — temporary form_boost_pct from API-Football fixture ratings.
 * Does NOT modify overall_rating, rating_source, or baseline fields.
 *
 * Env: API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: FORM_SYNC_MAX_FIXTURES_PER_RUN (default 10), FORM_SYNC_BUDGET_MS (default 90000)
 *
 * GET/POST ?force=true — reprocess fixtures since epoch (debug)
 * GET/POST ?status=true — last form sync metadata
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncSquadForm } from "./_shared/form-sync.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const FORM_META_KEY = "spin_draft_form_sync";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function parseBool(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

function readFlag(source: Record<string, unknown> | URLSearchParams, ...names: string[]): boolean {
  if (source instanceof URLSearchParams) {
    for (const name of names) {
      const v = source.get(name);
      if (v != null && parseBool(v)) return true;
    }
    return false;
  }
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(key.toLowerCase()) && parseBool(value)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!apiKey || !supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "Missing env configuration" }, 500);
  }

  const url = new URL(req.url);
  let force = readFlag(url.searchParams, "force");
  let statusOnly = readFlag(url.searchParams, "status");

  if (req.method === "POST") {
    try {
      const text = await req.text();
      if (text.trim()) {
        const body = JSON.parse(text) as Record<string, unknown>;
        force = readFlag(body, "force") || force;
        statusOnly = readFlag(body, "status") || statusOnly;
      }
    } catch {
      // ignore empty body
    }
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  if (statusOnly) {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", FORM_META_KEY)
      .maybeSingle();
    const lastFormSyncAt =
      (data?.value as { last_synced_at?: string } | null)?.last_synced_at ?? null;
    const { count } = await supabase
      .from("squad_players")
      .select("id", { count: "exact", head: true })
      .neq("form_boost_pct", 0);
    return jsonResponse({
      ok: true,
      lastFormSyncAt,
      playersWithFormBoost: count ?? 0,
    });
  }

  try {
    const result = await syncSquadForm(supabase, apiKey, { force });
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
