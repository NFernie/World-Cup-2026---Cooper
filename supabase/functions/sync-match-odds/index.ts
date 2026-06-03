/**
 * Fetch betting odds ~2 hours before kickoff (server-to-server).
 * Schedule: run hourly; function filters matches in [now+1h45m, now+2h15m] window.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const API_BASE = "https://v3.football.api-sports.io";

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

  const supabase = createClient(supabaseUrl, serviceKey);
  const now = Date.now();
  const windowStart = new Date(now + 105 * 60 * 1000).toISOString();
  const windowEnd = new Date(now + 135 * 60 * 1000).toISOString();

  const { data: matches } = await supabase
    .from("matches")
    .select("id, external_id, kickoff_at")
    .eq("status", "scheduled")
    .gte("kickoff_at", windowStart)
    .lte("kickoff_at", windowEnd);

  let synced = 0;

  for (const match of matches ?? []) {
    if (!match.external_id) continue;

    const oddsRes = await fetch(
      `${API_BASE}/odds?fixture=${match.external_id}`,
      { headers: { "x-apisports-key": apiKey } },
    );

    if (!oddsRes.ok) continue;

    const oddsPayload = await oddsRes.json();
    const bookmakers = oddsPayload.response?.[0]?.bookmakers ?? [];
    const matchWinner = bookmakers[0]?.bets?.find(
      (b: { name: string }) => b.name === "Match Winner",
    );
    if (!matchWinner?.values?.length) continue;

    const home = matchWinner.values.find((v: { value: string }) => v.value === "Home");
    const draw = matchWinner.values.find((v: { value: string }) => v.value === "Draw");
    const away = matchWinner.values.find((v: { value: string }) => v.value === "Away");
    if (!home || !draw || !away) continue;

    await supabase.from("match_odds").upsert({
      match_id: match.id,
      home_win_decimal: parseFloat(home.odd),
      draw_decimal: parseFloat(draw.odd),
      away_win_decimal: parseFloat(away.odd),
      fetched_at: new Date().toISOString(),
    });

    await supabase
      .from("matches")
      .update({ odds_synced_at: new Date().toISOString() })
      .eq("id", match.id);

    synced++;
  }

  return new Response(JSON.stringify({ ok: true, synced }), {
    headers: { "Content-Type": "application/json" },
  });
});
