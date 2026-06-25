/**
 * Map API-Football fixtures to public.matches rows.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const API_BASE = "https://v3.football.api-sports.io";

/** Post-full-time window for finished-match re-polls (narrowed from 60 days to cut egress). */
export const RECENT_FINISHED_WINDOW_MS = 6 * 60 * 60 * 1000;

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

function periodCapMinutes(apiShort: string, elapsed: number): number | null {
  const short = apiShort.toUpperCase();
  if (short === "1H") return 45;
  if (short === "2H") return 90;
  if (short === "ET") return elapsed <= 105 ? 105 : 120;
  return null;
}

/** API-Football `extra` is only meaningful at the end of a half (e.g. 90+4, not 55+6). */
function isApiStoppageTime(
  apiShort: string | undefined,
  elapsed: number | undefined,
  extra: number | undefined,
): boolean {
  if (extra == null || extra <= 0 || elapsed == null) return false;
  const cap = periodCapMinutes(apiShort ?? "", elapsed);
  if (cap == null) return false;
  return elapsed >= cap;
}

function rowValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return false;
}

function isMatchRowMateriallyUnchanged(
  prior: Record<string, unknown>,
  row: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(row)) {
    if (!rowValueEqual(prior[key], row[key])) return false;
  }
  return true;
}

type FixtureRow = {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed?: number | null; extra?: number | null };
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

  const kickoffAt = fx.fixture.date;
  const kickoffMs = new Date(kickoffAt).getTime();
  const hasKickedOff = kickoffMs <= Date.now() + 15 * 60 * 1000;

  let status = mapApiStatus(fx.fixture.status?.short);
  if (!hasKickedOff) {
    status = "scheduled";
  }

  const stage = mapApiStage(fx.league?.round);
  const homeScore = fx.goals.home;
  const awayScore = fx.goals.away;

  const row: Record<string, unknown> = {
    external_id: externalId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    kickoff_at: kickoffAt,
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

  const apiShort = fx.fixture.status?.short?.trim().toUpperCase();
  if (apiShort) row.api_status_short = apiShort;

  if (!hasKickedOff) {
    row.home_score = null;
    row.away_score = null;
    row.elapsed_minutes = null;
    row.extra_minutes = null;
    row.status_synced_at = null;
    row.scores_synced_at = null;
  } else if (status === "live") {
    let clockUpdated = false;
    const elapsed =
      typeof fx.fixture.status?.elapsed === "number" ? fx.fixture.status.elapsed : undefined;
    const rawExtra =
      typeof fx.fixture.status?.extra === "number" ? fx.fixture.status.extra : undefined;

    if (elapsed != null) {
      row.elapsed_minutes = elapsed;
      clockUpdated = true;
    }

    const stoppageExtra = isApiStoppageTime(apiShort, elapsed, rawExtra) ? rawExtra : null;
    row.extra_minutes = stoppageExtra;
    if (rawExtra != null) clockUpdated = true;

    if (apiShort) {
      clockUpdated = true;
    }
    // Only re-anchor when the API clock fields change — not on score-only updates.
    if (clockUpdated) {
      row.status_synced_at = new Date().toISOString();
    }

    if (homeScore != null && awayScore != null) {
      row.home_score = homeScore;
      row.away_score = awayScore;
    }
  } else {
    row.elapsed_minutes = null;
    row.extra_minutes = null;
    row.status_synced_at = null;

    if (homeScore != null && awayScore != null) {
      row.home_score = homeScore;
      row.away_score = awayScore;
    }
  }

  const existing = await findExistingMatch(
    supabase,
    externalId,
    homeTeamId,
    awayTeamId,
    fx.fixture.date,
  );

  if (existing) {
    const { data: prior } = await supabase
      .from("matches")
      .select(
        "status, stage, home_score, away_score, elapsed_minutes, extra_minutes, api_status_short, venue_name, venue_city, referee, attendance",
      )
      .eq("id", existing.id)
      .maybeSingle();

    if (status === "finished" && homeScore != null && awayScore != null) {
      const scoresChanged = prior?.home_score !== homeScore || prior?.away_score !== awayScore;
      const newlyFinished = prior?.status !== "finished";
      if (scoresChanged || newlyFinished) {
        row.scores_synced_at = new Date().toISOString();
      }
    }

    if (prior && isMatchRowMateriallyUnchanged(prior, row)) {
      return "skipped";
    }

    const { error } = await supabase.from("matches").update(row).eq("id", existing.id);
    if (error) return "skipped";

    const shouldRecalcStandings =
      recalculateOnFinish &&
      stage === "group" &&
      status === "finished" &&
      homeScore != null &&
      awayScore != null &&
      (prior?.status !== "finished" ||
        prior.home_score !== homeScore ||
        prior.away_score !== awayScore);

    if (shouldRecalcStandings) {
      await supabase.rpc("recalculate_pool_member_points", { p_match_id: existing.id });
      await supabase.rpc("recalculate_group_standings");
      return prior?.status === "finished" ? "upserted" : "finished";
    }
    return "upserted";
  }

  const { data: inserted, error } = await supabase
    .from("matches")
    .insert(row)
    .select("id")
    .single();

  if (error || !inserted) return "skipped";
  if (
    recalculateOnFinish &&
    stage === "group" &&
    status === "finished" &&
    homeScore != null &&
    awayScore != null
  ) {
    await supabase.rpc("recalculate_pool_member_points", { p_match_id: inserted.id });
    await supabase.rpc("recalculate_group_standings");
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
    const result = await upsertFixture(supabase, fx, true);
    if (result === "skipped") skipped++;
    else imported++;
  }

  if (imported > 0) {
    await supabase.rpc("recalculate_group_standings");
    await supabase.rpc("recalculate_pool_member_points");
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
  scoresSyncedAt?: string | null,
  homeScore?: number | null,
  awayScore?: number | null,
): boolean {
  if (status === "cancelled" || status === "postponed") return false;

  const kickoff = new Date(kickoffAt).getTime();
  const matchEnd = kickoff + 180 * 60 * 1000;

  if (status === "live") return true;

  // From kickoff until ~3h after (scheduled past kickoff until API marks live/finished).
  if (nowMs >= kickoff && nowMs <= matchEnd && status !== "finished") return true;

  // Stale: kickoff passed but still scheduled (missed live window).
  if (status === "scheduled" && nowMs > kickoff) return true;

  // Finished without API score sync or missing scores.
  if (status === "finished" && !scoresSyncedAt) return true;
  if (status === "finished" && (homeScore == null || awayScore == null)) return true;

  // Backfill goals/cards for finished matches that never received an events sync.
  if (status === "finished" && !eventsSyncedAt) {
    return true;
  }

  return false;
}

/**
 * Brief post-FT re-poll for standings backfill. Stops once scores and events are synced,
 * or after RECENT_FINISHED_WINDOW_MS (6h) from kickoff.
 */
export function isInRecentFinishedPollWindow(
  kickoffAt: string,
  status: string,
  nowMs = Date.now(),
  eventsSyncedAt?: string | null,
  scoresSyncedAt?: string | null,
  homeScore?: number | null,
  awayScore?: number | null,
): boolean {
  if (status !== "finished") return false;
  const kickoff = new Date(kickoffAt).getTime();
  if (nowMs - kickoff >= RECENT_FINISHED_WINDOW_MS) return false;

  if (!scoresSyncedAt || homeScore == null || awayScore == null) return true;
  if (!eventsSyncedAt) return true;
  return false;
}

/** Live / imminently-kicking-off matches only — no finished backfill (fast poll cron). */
export function isInFastLivePollWindow(
  kickoffAt: string,
  status: string,
  nowMs = Date.now(),
): boolean {
  if (status === "cancelled" || status === "postponed" || status === "finished") {
    return false;
  }

  const kickoff = new Date(kickoffAt).getTime();
  const preKickoff = kickoff - 15 * 60 * 1000;
  const matchEnd = kickoff + 180 * 60 * 1000;

  if (status === "live") return true;
  return nowMs >= preKickoff && nowMs <= matchEnd;
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
  if (e.type === "Goal" && e.detail !== "Missed Penalty") {
    return Boolean(e.player?.name);
  }
  if (e.type === "Card") {
    if (!e.player?.name) return false;
    const detail = e.detail ?? "";
    return detail === "Yellow Card" || detail === "Red Card" || detail === "Second Yellow";
  }
  if (e.type === "Var") {
    const detail = (e.detail ?? "").toLowerCase();
    return detail.includes("penalty");
  }
  return false;
}

type StoredEventRow = {
  minute: number;
  extra_minute: number | null;
  player_name: string;
  event_type: string;
  detail: string | null;
  sort_order: number;
};

function eventRowsSignature(rows: StoredEventRow[]): string {
  return rows
    .map((r) =>
      `${r.minute}:${r.extra_minute ?? ""}:${r.player_name}:${r.event_type}:${r.detail ?? ""}`
    )
    .join("|");
}

/** Goals, cards, and penalty VAR events from embedded fixtures?ids= response. */
export async function syncMatchEvents(
  supabase: SupabaseClient,
  matchId: string,
  events: ApiEvent[] | undefined,
): Promise<{ inserted: number; changed: boolean }> {
  if (events === undefined) return { inserted: 0, changed: false };

  const { data: existingRows } = await supabase
    .from("match_events")
    .select("minute, extra_minute, player_name, event_type, detail, sort_order")
    .eq("match_id", matchId)
    .order("sort_order", { ascending: true });

  const syncable = events
    .filter(isSyncableMatchEvent)
    .sort((a, b) => {
      const ma = (a.time?.elapsed ?? 0) * 100 + (a.time?.extra ?? 0);
      const mb = (b.time?.elapsed ?? 0) * 100 + (b.time?.extra ?? 0);
      return ma - mb;
    });

  const nextRows: StoredEventRow[] = syncable.map((e, i) => ({
    minute: e.time?.elapsed ?? 0,
    extra_minute: e.time?.extra ?? null,
    player_name: e.player?.name ?? (e.type === "Var" ? "VAR" : "Unknown"),
    event_type: e.type === "Card" ? "Card" : e.type === "Var" ? "Var" : "Goal",
    detail: e.detail ?? null,
    sort_order: i,
  }));

  const changed = eventRowsSignature(existingRows ?? []) !== eventRowsSignature(nextRows);
  if (!changed) {
    return { inserted: 0, changed: false };
  }

  await supabase.from("match_events").delete().eq("match_id", matchId);

  let inserted = 0;
  for (const row of nextRows) {
    const e = syncable[row.sort_order];
    const { error } = await supabase.from("match_events").insert({
      match_id: matchId,
      minute: row.minute,
      extra_minute: row.extra_minute,
      team_api_id: e.team?.id ?? null,
      player_name: row.player_name,
      assist_name: e.type === "Goal" ? e.assist?.name ?? null : null,
      event_type: row.event_type,
      detail: row.detail,
      sort_order: row.sort_order,
    });
    if (!error) inserted++;
  }

  await supabase
    .from("matches")
    .update({ events_synced_at: new Date().toISOString() })
    .eq("id", matchId);

  return { inserted, changed: true };
}

/** @deprecated Use syncMatchEvents */
export async function syncMatchGoalEvents(
  supabase: SupabaseClient,
  matchId: string,
  events: ApiEvent[] | undefined,
): Promise<number> {
  const result = await syncMatchEvents(supabase, matchId, events);
  return result.inserted;
}

export type SyncActiveMatchOptions = {
  /** full = backfill + live window; live = in-play / pre-kickoff only (fast cron). */
  mode?: "full" | "live";
};

/** Poll only fixtures in the active window — 1 API call per batch of ids (not whole league). */
export async function syncActiveMatchScores(
  supabase: SupabaseClient,
  apiKey: string,
  options: SyncActiveMatchOptions = {},
): Promise<{
  updated: number;
  eventsUpdated: number;
  scoreChanges: number;
  eventsChanged: number;
  materialChanges: number;
  apiCalls: number;
  activeCount: number;
  skipped: string | null;
}> {
  const mode = options.mode ?? "full";
  const nowMs = Date.now();

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "external_id, kickoff_at, status, events_synced_at, scores_synced_at, home_score, away_score",
    )
    .not("external_id", "is", null);

  const active = (matches ?? [])
    .filter((m) =>
      mode === "live"
        ? isInFastLivePollWindow(m.kickoff_at, m.status, nowMs)
        : isInLivePollWindow(
            m.kickoff_at,
            m.status,
            nowMs,
            m.events_synced_at,
            m.scores_synced_at,
            m.home_score,
            m.away_score,
          ) || isInRecentFinishedPollWindow(
            m.kickoff_at,
            m.status,
            nowMs,
            m.events_synced_at,
            m.scores_synced_at,
            m.home_score,
            m.away_score,
          )
    )
    .sort((a, b) => {
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      return new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime();
    });

  if (active.length === 0) {
    return {
      updated: 0,
      eventsUpdated: 0,
      scoreChanges: 0,
      eventsChanged: 0,
      materialChanges: 0,
      apiCalls: 0,
      activeCount: 0,
      skipped: mode === "live"
        ? "no matches in fast live window (15m pre-kickoff → 3h after)"
        : "no matches in live poll window (kickoff → 3h after, or brief post-FT for scorers)",
    };
  }

  const ids = active.map((m) => m.external_id as string);
  let updated = 0;
  let eventsUpdated = 0;
  let scoreChanges = 0;
  let eventsChanged = 0;
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
      const externalId = String(fx.fixture.id);
      const matchId = await resolveMatchIdByExternalId(supabase, externalId);

      let beforeScores: { home_score: number | null; away_score: number | null } | null = null;
      if (matchId) {
        const { data } = await supabase
          .from("matches")
          .select("home_score, away_score")
          .eq("id", matchId)
          .maybeSingle();
        beforeScores = data;
      }

      const result = await upsertFixture(supabase, fx, true);
      if (result === "finished" || result === "upserted") updated++;
      if (result === "skipped" || !matchId) continue;

      if (beforeScores) {
        const homeScore = fx.goals.home;
        const awayScore = fx.goals.away;
        if (
          homeScore != null &&
          awayScore != null &&
          (beforeScores.home_score !== homeScore || beforeScores.away_score !== awayScore)
        ) {
          scoreChanges++;
        }
      }

      const eventResult = await syncMatchEvents(supabase, matchId, fx.events);
      eventsUpdated += eventResult.inserted;
      if (eventResult.changed) eventsChanged++;
    }
  }

  const materialChanges = scoreChanges + eventsChanged;

  return {
    updated,
    eventsUpdated,
    scoreChanges,
    eventsChanged,
    materialChanges,
    apiCalls,
    activeCount: active.length,
    skipped: null,
  };
}
