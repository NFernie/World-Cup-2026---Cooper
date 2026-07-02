/**
 * Live scores + match events during active matches and backfill for finished games.
 * mode=live: fast poll for in-play matches (2-min cron). Chains follow-up passes when
 * scores or events change so goals/cards surface without waiting for the next cron.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncAwardsAfterMatch } from "./_shared/awards-sync.ts";
import {
  syncActiveMatchScores,
  syncKnockoutFixturesFromApi,
} from "./_shared/fixture-sync.ts";

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
  const leagueId = Deno.env.get("API_FOOTBALL_LEAGUE_ID") ?? "1";
  const season = Deno.env.get("API_FOOTBALL_SEASON") ?? "2026";

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

  const totalMaterialChanges = passes.reduce((sum, p) => sum + p.materialChanges, 0);
  const totalFinishes = passes.reduce((sum, p) => sum + p.finishesApplied, 0);
  const totalGroupFinishes = passes.reduce((sum, p) => sum + p.groupFinishesApplied, 0);
  const totalKnockoutFinishes = passes.reduce(
    (sum, p) => sum + p.knockoutFinishesApplied,
    0,
  );
  const totalScoreChanges = passes.reduce((sum, p) => sum + p.scoreChanges, 0);

  let knockoutFixtures: Awaited<ReturnType<typeof syncKnockoutFixturesFromApi>> | null = null;

  if (totalGroupFinishes > 0) {
    await supabase.rpc("recalculate_group_standings");
  }

  // Full cron pass: always reconcile knockout stages from finished matches (not only
  // when a match newly finishes — otherwise teams stay at round_of_32 after deploy/backfill).
  if (mode === "full") {
    await supabase.rpc("advance_knockout_winners");
  } else if (totalKnockoutFinishes > 0) {
    await supabase.rpc("advance_knockout_winners");
  } else if (totalScoreChanges > 0) {
    const { count: activeKnockout } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .neq("stage", "group")
      .in("status", ["live", "scheduled"])
      .lte("kickoff_at", new Date().toISOString());

    if ((activeKnockout ?? 0) > 0) {
      await supabase.rpc("advance_knockout_winners");
    }
  }

  if (totalKnockoutFinishes > 0) {
    knockoutFixtures = await syncKnockoutFixturesFromApi(
      supabase,
      apiKey,
      leagueId,
      season,
    );
  }

  let awards: Awaited<ReturnType<typeof syncAwardsAfterMatch>> | null = null;
  if (totalMaterialChanges > 0) {
    awards = await syncAwardsAfterMatch(supabase, apiKey, leagueId, season);
  }

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
      finishesApplied: passes.reduce((sum, p) => sum + p.finishesApplied, 0),
      groupFinishesApplied: totalGroupFinishes,
      knockoutFinishesApplied: totalKnockoutFinishes,
      knockoutFixtures,
      eventsUpdated: passes.reduce((sum, p) => sum + p.eventsUpdated, 0),
      updated: passes.reduce((sum, p) => sum + p.updated, 0),
      awards,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
