/**
 * Live scores only during active matches (15 min pre-kickoff → 3h after).
 * Does NOT call API when no match is in that window. No awards sync (see sync-tournament-awards).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncActiveMatchScores } from "./_shared/fixture-sync.ts";

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
  const result = await syncActiveMatchScores(supabase, apiKey);

  return new Response(
    JSON.stringify({ ok: true, ...result }),
    { headers: { "Content-Type": "application/json" } },
  );
});
