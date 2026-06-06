/**
 * Server-to-server sync: live + finished scores, tournament awards.
 * Schedule: every 5 minutes during the tournament (pg_cron).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncTournamentAwards } from "./_shared/awards-sync.ts";
import { syncScoresByStatus } from "./_shared/fixture-sync.ts";

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

  const liveUpdated = await syncScoresByStatus(
    supabase,
    apiKey,
    leagueId,
    season,
    "1H-HT-2H-ET-LIVE",
    false,
  );

  const finishedUpdated = await syncScoresByStatus(
    supabase,
    apiKey,
    leagueId,
    season,
    "FT-AET-PEN",
    true,
  );

  let awards = { teamIds: 0, scorers: 0, goalkeepers: 0, expectedTeams: 48 };
  try {
    awards = await syncTournamentAwards(supabase, apiKey, leagueId, season);
  } catch (e) {
    console.error("awards sync failed", e);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      liveUpdated,
      finishedUpdated,
      updated: liveUpdated + finishedUpdated,
      awards,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
