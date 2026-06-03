/**
 * Server-to-server sync: finished match scores only (Path C hybrid).
 * Schedule via Supabase cron every 5 minutes during tournament windows.
 * Env: API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const API_BASE = "https://v3.football.api-sports.io";

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

  const leagueId = Deno.env.get("API_FOOTBALL_LEAGUE_ID") ?? "1";
  const season = Deno.env.get("API_FOOTBALL_SEASON") ?? "2026";

  const supabase = createClient(supabaseUrl, serviceKey);

  const fixturesRes = await fetch(
    `${API_BASE}/fixtures?league=${leagueId}&season=${season}&status=FT`,
    { headers: { "x-apisports-key": apiKey } },
  );

  if (!fixturesRes.ok) {
    return new Response(
      JSON.stringify({ error: "API-Football request failed", status: fixturesRes.status }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const payload = await fixturesRes.json();
  const fixtures = payload.response ?? [];
  let updated = 0;

  for (const fx of fixtures) {
    const externalId = String(fx.fixture.id);
    const homeGoals = fx.goals.home;
    const awayGoals = fx.goals.away;
    if (homeGoals == null || awayGoals == null) continue;

    const { data: match } = await supabase
      .from("matches")
      .select("id")
      .eq("external_id", externalId)
      .maybeSingle();

    if (!match) continue;

    await supabase
      .from("matches")
      .update({
        home_score: homeGoals,
        away_score: awayGoals,
        status: "finished",
        scores_synced_at: new Date().toISOString(),
      })
      .eq("id", match.id);

    await supabase.rpc("recalculate_pool_member_points", { p_match_id: match.id });
    updated++;
  }

  return new Response(JSON.stringify({ ok: true, updated }), {
    headers: { "Content-Type": "application/json" },
  });
});
