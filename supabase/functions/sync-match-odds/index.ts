/**
 * Fetch betting odds from API-Football for upcoming fixtures.
 * Schedule: hourly via pg_cron. Fetches up to 14 days before kickoff (API window).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const API_BASE = "https://v3.football.api-sports.io";

function pickMatchWinnerOdds(bookmakers: Array<Record<string, unknown>>) {
  for (const bm of bookmakers) {
    const bets = bm.bets as Array<{ name: string; values?: Array<{ value: string; odd: string }> }> | undefined;
    const matchWinner = bets?.find((b) => b.name === "Match Winner");
    if (!matchWinner?.values?.length) continue;

    const home = matchWinner.values.find((v) => v.value === "Home");
    const draw = matchWinner.values.find((v) => v.value === "Draw");
    const away = matchWinner.values.find((v) => v.value === "Away");
    if (home && draw && away) return { home, draw, away };
  }
  return null;
}

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
  const windowStart = new Date(now - 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: matches } = await supabase
    .from("matches")
    .select("id, external_id, kickoff_at, odds_synced_at, status")
    .in("status", ["scheduled", "live"])
    .not("external_id", "is", null)
    .gte("kickoff_at", windowStart)
    .lte("kickoff_at", windowEnd);

  let synced = 0;
  let noOdds = 0;

  for (const match of matches ?? []) {
    if (!match.external_id) continue;

    const kickoffMs = new Date(match.kickoff_at).getTime();
    const hoursToKick = (kickoffMs - now) / (60 * 60 * 1000);
    if (match.odds_synced_at && hoursToKick > 6) {
      const ageMs = now - new Date(match.odds_synced_at).getTime();
      if (ageMs < 3 * 60 * 60 * 1000) continue;
    }

    const oddsRes = await fetch(
      `${API_BASE}/odds?fixture=${match.external_id}`,
      { headers: { "x-apisports-key": apiKey } },
    );

    if (!oddsRes.ok) continue;

    const oddsPayload = await oddsRes.json();
    const bookmakers = oddsPayload.response?.[0]?.bookmakers ?? [];
    const picked = pickMatchWinnerOdds(bookmakers);
    if (!picked) {
      noOdds++;
      continue;
    }

    await supabase.from("match_odds").upsert({
      match_id: match.id,
      home_win_decimal: parseFloat(picked.home.odd),
      draw_decimal: parseFloat(picked.draw.odd),
      away_win_decimal: parseFloat(picked.away.odd),
      fetched_at: new Date().toISOString(),
    });

    await supabase
      .from("matches")
      .update({ odds_synced_at: new Date().toISOString() })
      .eq("id", match.id);

    synced++;
  }

  return new Response(
    JSON.stringify({ ok: true, synced, noOdds, candidates: matches?.length ?? 0 }),
    { headers: { "Content-Type": "application/json" } },
  );
});
