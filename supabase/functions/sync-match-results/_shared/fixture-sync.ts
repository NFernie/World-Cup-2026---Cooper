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
  fixture: {
    id: number;
    date: string;
    status: { short: string };
    referee?: string | null;
    venue?: { name?: string | null; city?: string | null } | null;
    attendance?: number | null;
  };
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

  const venueName = fx.fixture.venue?.name?.trim();
  const venueCity = fx.fixture.venue?.city?.trim();
  const referee = fx.fixture.referee?.trim();
  if (venueName) row.venue_name = venueName;
  if (venueCity) row.venue_city = venueCity;
  if (referee) row.referee = referee;
  if (typeof fx.fixture.attendance === "number" && fx.fixture.attendance > 0) {
    row.attendance = fx.fixture.attendance;
  }

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

/**
 * Matches that need live polling: from kickoff until ~3h after (covers ET).
 * No pre-kickoff API calls. Brief post-FT poll only to capture final goal scorers.
 */
export function isInLivePollWindow(
  kickoffAt: string,
  status: string,
  nowMs = Date.now(),
  eventsSyncedAt?: string | null,
): boolean {
  if (status === "cancelled" || status === "postponed") return false;

  const kickoff = new Date(kickoffAt).getTime();
  const matchEnd = kickoff + 180 * 60 * 1000;

  if (status === "live") return true;

  // From kickoff until ~3h after (scheduled past kickoff until API marks live/finished).
  if (nowMs >= kickoff && nowMs <= matchEnd && status !== "finished") return true;

  // Backfill goals/cards for finished matches that never received an events sync.
  if (status === "finished" && !eventsSyncedAt) {
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

function isSyncableMatchEvent(e: ApiEvent): boolean {
  if (!e.player?.name) return false;
  if (e.type === "Goal" && e.detail !== "Missed Penalty") return true;
  if (e.type === "Card") {
    const detail = e.detail ?? "";
    return detail === "Yellow Card" || detail === "Red Card" || detail === "Second Yellow";
  }
  return false;
}

/** Goals and cards from embedded fixtures?ids= response — no extra API call. */
export async function syncMatchEvents(
  supabase: SupabaseClient,
  matchId: string,
  events: ApiEvent[] | undefined,
): Promise<number> {
  if (events === undefined) return 0;

  const syncable = events
    .filter(isSyncableMatchEvent)
    .sort((a, b) => {
      const ma = (a.time?.elapsed ?? 0) * 100 + (a.time?.extra ?? 0);
      const mb = (b.time?.elapsed ?? 0) * 100 + (b.time?.extra ?? 0);
      return ma - mb;
    });

  await supabase.from("match_events").delete().eq("match_id", matchId);

  let inserted = 0;
  for (let i = 0; i < syncable.length; i++) {
    const e = syncable[i];
    const { error } = await supabase.from("match_events").insert({
      match_id: matchId,
      minute: e.time?.elapsed ?? 0,
      extra_minute: e.time?.extra ?? null,
      team_api_id: e.team?.id ?? null,
      player_name: e.player!.name!,
      assist_name: e.type === "Goal" ? e.assist?.name ?? null : null,
      event_type: e.type === "Card" ? "Card" : "Goal",
      detail: e.detail ?? null,
      sort_order: i,
    });
    if (!error) inserted++;
  }

  await supabase
    .from("matches")
    .update({ events_synced_at: new Date().toISOString() })
    .eq("id", matchId);

  return inserted;
}

/** @deprecated Use syncMatchEvents */
export async function syncMatchGoalEvents(
  supabase: SupabaseClient,
  matchId: string,
  events: ApiEvent[] | undefined,
): Promise<number> {
  return syncMatchEvents(supabase, matchId, events);
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

  const active = (matches ?? [])
    .filter((m) =>
      isInLivePollWindow(m.kickoff_at, m.status, Date.now(), m.events_synced_at)
    )
    .sort((a, b) => {
      // Prioritise live, then recent kickoffs (backfill finished matches newest first).
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      return new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime();
    });

  if (active.length === 0) {
    return {
      updated: 0,
      eventsUpdated: 0,
      apiCalls: 0,
      activeCount: 0,
      skipped: "no matches in live poll window (kickoff → 3h after, or brief post-FT for scorers)",
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
        eventsUpdated += await syncMatchEvents(supabase, matchId, fx.events);
      }
    }
  }

  return { updated, eventsUpdated, apiCalls, activeCount: active.length, skipped: null };
}
