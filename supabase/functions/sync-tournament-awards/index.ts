/**
 * Sync Golden Boot / Golden Glove player stats from API-Football.
 * Env: API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: API_FOOTBALL_LEAGUE_ID (default 1 = World Cup), API_FOOTBALL_SEASON (default 2026)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncTournamentAwards } from "./_shared/awards-sync.ts";

Deno.serve(async () => {
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!apiKey || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing env configuration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const leagueId = Deno.env.get("API_FOOTBALL_LEAGUE_ID") ?? "1";
  const season = Deno.env.get("API_FOOTBALL_SEASON") ?? "2026";

  const supabase = createClient(supabaseUrl, serviceKey);
  const result = await syncTournamentAwards(supabase, apiKey, leagueId, season);

  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: { "Content-Type": "application/json" },
  });
});
