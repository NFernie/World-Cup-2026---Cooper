/**
 * Import World Cup 2026 national-team squads + derived ratings into public.squad_players.
 * Env: API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: API_FOOTBALL_SEASON (default 2026)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncSquads } from "./_shared/squad-sync.ts";

Deno.serve(async (req) => {
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!apiKey || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing env configuration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Optional { "force": true } in the body bypasses the once-per-day guard.
  let force = false;
  try {
    const body = await req.json();
    force = body?.force === true;
  } catch {
    force = false;
  }

  const season = Deno.env.get("API_FOOTBALL_SEASON") ?? "2026";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const result = await syncSquads(supabase, apiKey, season, { force });
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
