/**
 * Sync Golden Boot / Golden Glove player stats from API-Football.
 * mode=light (default): topscorers + goal events + clean sheets when matches are active.
 * mode=full: includes all goalkeeper squad polls (~50 API calls).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  isInAwardsSyncWindow,
  syncAwardsAfterMatch,
  syncTournamentAwards,
} from "./_shared/awards-sync.ts";

type AwardsMode = "light" | "full";

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

  let mode: AwardsMode = "light";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.mode === "full") mode = "full";
    } catch {
      // empty body — default light sync
    }
  }

  const leagueId = Deno.env.get("API_FOOTBALL_LEAGUE_ID") ?? "1";
  const season = Deno.env.get("API_FOOTBALL_SEASON") ?? "2026";

  const supabase = createClient(supabaseUrl, serviceKey);

  if (mode === "light") {
    const inWindow = await isInAwardsSyncWindow(supabase);
    if (!inWindow) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode,
          skipped: "no matches in awards sync window",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const result = await syncAwardsAfterMatch(supabase, apiKey, leagueId, season);
    return new Response(JSON.stringify({ ok: true, mode, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await syncTournamentAwards(supabase, apiKey, leagueId, season);
  return new Response(JSON.stringify({ ok: true, mode, ...result }), {
    headers: { "Content-Type": "application/json" },
  });
});
