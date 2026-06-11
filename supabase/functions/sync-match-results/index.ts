/**
 * Live scores + match events (goals, yellow/red cards) during active matches and backfill
 * for finished matches missing events_synced_at. No awards sync (see sync-tournament-awards).
 * Events are parsed from the same fixtures?ids= response (no extra API call).
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
