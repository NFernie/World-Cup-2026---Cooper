/**
 * Map API-Football fixtures to public.matches rows.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const API_BASE = "https://v3.football.api-sports.io";

type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";
type TournamentStage =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarter_final"
  | "semi_final"
  | "third_place"
  | "final";

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);
const POSTPONED_STATUSES = new Set(["PST", "SUSP", "TBD", "NS"]);
const CANCELLED_STATUSES = new Set(["CANC", "ABD", "AWD", "WO"]);

export type ApiProbe = {
  url: string;
  ok: boolean;
  results: number;
  errors: unknown;
};

function apiHeaders(apiKey: string) {
  return { "x-apisports-key": apiKey };
}

export function mapApiStatus(short: string | undefined): MatchStatus {
  const s = (short ?? "NS").toUpperCase();
  if (FINISHED_STATUSES.has(s)) return "finished";
  if (LIVE_STATUSES.has(s)) return "live";
  if (CANCELLED_STATUSES.has(s)) return "cancelled";
  if (POSTPONED_STATUSES.has(s)) return "scheduled";
  return "scheduled";
}

export function mapApiStage(round: string | undefined): TournamentStage {
  const r = (round ?? "").toLowerCase();
  if (r.includes("final") && (r.includes("3rd") || r.includes("third"))) return "third_place";
  if (r === "final" || r.includes("world cup - final")) return "final";
  if (r.includes("semi")) return "semi_final";
  if (r.includes("quarter")) return "quarter_final";
  if (r.includes("round of 16")) return "round_of_16";
  if (r.includes("round of 32") || (r.includes("32") && !r.includes("16"))) return "round_of_32";
  return "group";
}

type FixtureRow = {
  fixture: { id: number; date: string; status: { short: string } };
  teams: { home: { id: number }; away: { id: number } };
  goals: { home: number | null; away: number | null };
  league: { round?: string };
  events?: ApiEvent[];
};

type ApiEvent = {
  time?: { elapsed?: number; extra?: number | null };
  team?: { id?: number; name?: string };
  player?: { name?: string };
  assist?: { name?: string | null } | null;
  type?: string;
  detail?: string;
};

async function resolveTeamId(
  supabase: SupabaseClient,
  apiTeamId: number,
): Promise<string | null> {
  const { data } = await supabase
    .from("teams")
    .select("id")
    .eq("api_football_team_id", apiTeamId)
    .maybeSingle();
  return data?.id ?? null;
}

async function findExistingMatch(
  supabase: SupabaseClient,
  externalId: string,
  homeTeamId: string,
  awayTeamId: string,
  kickoffAt: string,
) {
  const { data: byExternal } = await supabase
    .from("matches")
    .select("id, status")
    .eq("external_id", externalId)
    .maybeSingle();
  if (byExternal) return byExternal;

  const kickoff = new Date(kickoffAt).getTime();
  const from = new Date(kickoff - 36 * 60 * 60 * 1000).toISOString();
  const to = new Date(kickoff + 36 * 60 * 60 * 1000).toISOString();

  const { data: byTeams } = await supabase
    .from("matches")
    .select("id, status")
    .eq("home_team_id", homeTeamId)
    .eq("away_team_id", awayTeamId)
    .gte("kickoff_at", from)
    .lte("kickoff_at", to)
    .maybeSingle();

  return byTeams;
}

export async function upsertFixture(
  supabase: SupabaseClient,
  fx: FixtureRow,
  recalculateOnFinish: boolean,
): Promise<"upserted" | "skipped" | "finished"> {
  const externalId = String(fx.fixture.id);
  const homeApiId = fx.teams.home.id;
  const awayApiId = fx.teams.away.id;
  if (!homeApiId || !awayApiId) return "skipped";

  const homeTeamId = await resolveTeamId(supabase, homeApiId);
  const awayTeamId = await resolveTeamId(supabase, awayApiId);
  if (!homeTeamId || !awayTeamId) return "skipped";

  const status = mapApiStatus(fx.fixture.status?.short);
  const stage = mapApiStage(fx.league?.round);
  const homeScore = fx.goals.home;
  const awayScore = fx.goals.away;

  const row: Record<string, unknown> = {
    external_id: externalId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    kickoff_at: fx.fixture.date,
    status,
    stage,
  };

  if (homeScore != null && awayScore != null) {
    row.home_score = homeScore;
    row.away_score = awayScore;
  }
  if (status === "finished") {
    row.scores_synced_at = new Date().toISOString();
  }

  const existing = await findExistingMatch(
    supabase,
    externalId,
    homeTeamId,
    awayTeamId,
    fx.fixture.date,
  );

  if (existing) {
    const { error } = await supabase.from("matches").update(row).eq("id", existing.id);
    if (error) return "skipped";
    if (status === "finished" && recalculateOnFinish) {
      await supabase.rpc("recalculate_pool_member_points", { p_match_id: existing.id });
      return "finished";
    }
    return "upserted";
  }

  const { data: inserted, error } = await supabase
    .from("matches")
    .insert(row)
    .select("id")
    .single();

  if (error || !inserted) return "skipped";
  if (status === "finished" && recalculateOnFinish) {
    await supabase.rpc("recalculate_pool_member_points", { p_match_id: inserted.id });
    return "finished";
  }
  return "upserted";
}

function hasApiErrors(errors: unknown): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors as object).length > 0;
  return true;
}

async function fetchFixturePage(
  apiKey: string,
  url: string,
): Promise<{ ok: boolean; payload: Record<string, unknown>; probe: ApiProbe }> {
  const res = await fetch(url, { headers: apiHeaders(apiKey) });
  const payload = await res.json() as Record<string, unknown>;
  const probe: ApiProbe = {
    url,
    ok: res.ok,
    results: Number(payload.results ?? 0),
    errors: payload.errors ?? null,
  };
  return { ok: res.ok, payload, probe };
}

export async function fetchAllFixtures(
  apiKey: string,
  leagueId: string,
  season: string,
  statusFilter?: string,
): Promise<{ fixtures: FixtureRow[]; probes: ApiProbe[] }> {
  const statusParam = statusFilter ? `&status=${statusFilter}` : "";
  // WC 2026 fixtures: do NOT pass `page` — API returns "The Page field do not exist."
  const urls = [
    `${API_BASE}/fixtures?league=${leagueId}&season=${season}${statusParam}`,
    `${API_BASE}/fixtures?league=${leagueId}&season=${season}&from=2026-06-01&to=2026-07-31${statusParam}`,
  ];

  const probes: ApiProbe[] = [];

  for (const url of urls) {
    const { ok, payload, probe } = await fetchFixturePage(apiKey, url);
    probes.push(probe);
    const count = Number(payload.results ?? 0);
    if (ok && !hasApiErrors(payload.errors) && count > 0) {
      const fixtures = ((payload.response as FixtureRow[]) ?? []).slice();
      return { fixtures, probes };
    }
  }

  return { fixtures: [], probes };
}

export async function syncAllFixturesFromApi(
  supabase: SupabaseClient,
  apiKey: string,
  leagueId: string,
  season: string,
): Promise<{
  imported: number;
  skipped: number;
  demoRemoved: number;
  apiFixtureCount: number;
  probes: ApiProbe[];
}> {
  const { fixtures, probes } = await fetchAllFixtures(apiKey, leagueId, season);
  let imported = 0;
  let skipped = 0;

  for (const fx of fixtures) {
    const result = await upsertFixture(supabase, fx, false);
    if (result === "skipped") skipped++;
    else imported++;
  }

  let demoRemoved = 0;
  if (imported > 0) {
    const { data: demo } = await supabase.from("matches").select("id").is("external_id", null);
    if (demo?.length) {
      await supabase.from("matches").delete().is("external_id", null);
      demoRemoved = demo.length;
    }
  }

  return { imported, skipped, demoRemoved, apiFixtureCount: fixtures.length, probes };
}

export async function syncScoresByStatus(
  supabase: SupabaseClient,
  apiKey: string,
  leagueId: string,
  season: string,
  statusFilter: string,
  recalculateOnFinish: boolean,
): Promise<number> {
  const { fixtures } = await fetchAllFixtures(apiKey, leagueId, season, statusFilter);
  let updated = 0;

  for (const fx of fixtures) {
    const result = await upsertFixture(supabase, fx, recalculateOnFinish);
    if (result === "finished" || result === "upserted") updated++;
  }

  return updated;
}

/** Matches that need live polling: from 15 min before kickoff until ~3h after (covers ET). */
export function isInLivePollWindow(
  kickoffAt: string,
  status: string,
  nowMs = Date.now(),
  eventsSyncedAt?: string | null,
): boolean {
  if (status === "cancelled" || status === "postponed") return false;
  if (status === "live") return true;
  const kickoff = new Date(kickoffAt).getTime();
  const start = kickoff - 15 * 60 * 1000;
  const end = kickoff + 180 * 60 * 1000;
  if (nowMs >= start && nowMs <= end) return true;
  // Brief post-FT poll so final goal scorers/assists are captured (same fixtures?ids= call).
  if (status === "finished" && !eventsSyncedAt && nowMs <= kickoff + 240 * 60 * 1000) {
    return true;
  }
  return false;
}

async function resolveMatchIdByExternalId(
  supabase: SupabaseClient,
  externalId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("matches")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Goal events from embedded fixtures?ids= response — no extra API call. */
export async function syncMatchGoalEvents(
  supabase: SupabaseClient,
  matchId: string,
  events: ApiEvent[] | undefined,
): Promise<number> {
  if (!events?.length) return 0;

  const goals = events.filter(
    (e) =>
      e.type === "Goal" &&
      e.detail !== "Missed Penalty" &&
      e.player?.name,
  );
  if (goals.length === 0) return 0;

  await supabase.from("match_events").delete().eq("match_id", matchId);

  let inserted = 0;
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    const { error } = await supabase.from("match_events").insert({
      match_id: matchId,
      minute: g.time?.elapsed ?? 0,
      extra_minute: g.time?.extra ?? null,
      team_api_id: g.team?.id ?? null,
      player_name: g.player!.name!,
      assist_name: g.assist?.name ?? null,
      event_type: "Goal",
      detail: g.detail ?? null,
      sort_order: i,
    });
    if (!error) inserted++;
  }

  if (inserted > 0) {
    await supabase
      .from("matches")
      .update({ events_synced_at: new Date().toISOString() })
      .eq("id", matchId);
  }

  return inserted;
}

/** Poll only fixtures in the active window — 1 API call per batch of ids (not whole league). */
export async function syncActiveMatchScores(
  supabase: SupabaseClient,
  apiKey: string,
): Promise<{
  updated: number;
  eventsUpdated: number;
  apiCalls: number;
  activeCount: number;
  skipped: string | null;
}> {
  const { data: matches } = await supabase
    .from("matches")
    .select("external_id, kickoff_at, status, events_synced_at")
    .not("external_id", "is", null);

  const active = (matches ?? []).filter((m) =>
    isInLivePollWindow(m.kickoff_at, m.status, Date.now(), m.events_synced_at)
  );

  if (active.length === 0) {
    return {
      updated: 0,
      eventsUpdated: 0,
      apiCalls: 0,
      activeCount: 0,
      skipped: "no matches in live poll window (15 min pre-kickoff → 3h after)",
    };
  }

  const ids = active.map((m) => m.external_id as string);
  let updated = 0;
  let eventsUpdated = 0;
  let apiCalls = 0;

  const chunkSize = 20;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize).join("-");
    const res = await fetch(`${API_BASE}/fixtures?ids=${chunk}`, {
      headers: apiHeaders(apiKey),
    });
    apiCalls++;
    if (!res.ok) continue;

    const payload = await res.json();
    if (hasApiErrors(payload.errors)) continue;

    for (const fx of (payload.response as FixtureRow[]) ?? []) {
      const result = await upsertFixture(supabase, fx, true);
      if (result === "finished" || result === "upserted") updated++;

      const matchId = await resolveMatchIdByExternalId(supabase, String(fx.fixture.id));
      if (matchId) {
        eventsUpdated += await syncMatchGoalEvents(supabase, matchId, fx.events);
      }
    }
  }

  return { updated, eventsUpdated, apiCalls, activeCount: active.length, skipped: null };
}
