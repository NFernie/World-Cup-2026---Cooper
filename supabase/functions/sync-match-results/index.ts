/**
 * Live scores + match events during active matches and backfill for finished games.
 * mode=live: fast poll for in-play matches (2-min cron). Chains follow-up passes when
 * scores or events change so goals/cards surface without waiting for the next cron.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncActiveMatchScores } from "./_shared/fixture-sync.ts";

const MAX_PASSES = 2;
const FOLLOW_UP_DELAY_MS = 30_000;

type SyncMode = "full" | "live";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  let mode: SyncMode = "full";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.mode === "live") mode = "live";
    } catch {
      // empty body — default full sync
    }
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const passes: Awaited<ReturnType<typeof syncActiveMatchScores>>[] = [];
  let pass = 0;
  let materialChanges = 0;
  let activeCount = 0;

  do {
    if (pass > 0) {
      await sleep(FOLLOW_UP_DELAY_MS);
    }

    const result = await syncActiveMatchScores(supabase, apiKey, { mode });
    passes.push(result);
    materialChanges = result.materialChanges;
    activeCount = result.activeCount;
    pass++;
  } while (materialChanges > 0 && pass < MAX_PASSES && activeCount > 0);

  const last = passes[passes.length - 1] ?? {
    updated: 0,
    eventsUpdated: 0,
    scoreChanges: 0,
    eventsChanged: 0,
    materialChanges: 0,
    apiCalls: 0,
    activeCount: 0,
    skipped: "no passes run",
  };

  return new Response(
    JSON.stringify({
      ok: true,
      mode,
      passes: pass,
      chainedFollowUps: pass > 1,
      ...last,
      apiCalls: passes.reduce((sum, p) => sum + p.apiCalls, 0),
      scoreChanges: passes.reduce((sum, p) => sum + p.scoreChanges, 0),
      eventsChanged: passes.reduce((sum, p) => sum + p.eventsChanged, 0),
      materialChanges: passes.reduce((sum, p) => sum + p.materialChanges, 0),
      eventsUpdated: passes.reduce((sum, p) => sum + p.eventsUpdated, 0),
      updated: passes.reduce((sum, p) => sum + p.updated, 0),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
