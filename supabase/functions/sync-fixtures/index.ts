/**
 * Import / refresh World Cup 2026 fixture list from API-Football into public.matches.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncAllFixturesFromApi } from "./_shared/fixture-sync.ts";
import { syncApiFootballTeamIds } from "./_shared/awards-sync.ts";

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

  const teamIds = await syncApiFootballTeamIds(supabase, apiKey, leagueId, season);
  const result = await syncAllFixturesFromApi(supabase, apiKey, leagueId, season);

  return new Response(
    JSON.stringify({
      ok: true,
      teamIds,
      leagueId,
      season,
      ...result,
      hint: result.apiFixtureCount === 0
        ? "API returned 0 fixtures — check probes[].errors and confirm API_FOOTBALL_SEASON=2026 in Edge secrets."
        : undefined,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
