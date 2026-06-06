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
  if (r.includes("round of 16") || r.includes("round of 16")) return "round_of_16";
  if (r.includes("round of 32") || r.includes("32")) return "round_of_32";
  return "group";
}

type FixtureRow = {
  fixture: { id: number; date: string; status: { short: string } };
  teams: { home: { id: number }; away: { id: number } };
  goals: { home: number | null; away: number | null };
  league: { round?: string };
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

  const { data: existing } = await supabase
    .from("matches")
    .select("id, status")
    .eq("external_id", externalId)
    .maybeSingle();

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

export async function fetchAllFixtures(
  apiKey: string,
  leagueId: string,
  season: string,
  statusFilter?: string,
): Promise<FixtureRow[]> {
  const all: FixtureRow[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const statusParam = statusFilter ? `&status=${statusFilter}` : "";
    const res = await fetch(
      `${API_BASE}/fixtures?league=${leagueId}&season=${season}&page=${page}${statusParam}`,
      { headers: apiHeaders(apiKey) },
    );
    if (!res.ok) break;

    const payload = await res.json();
    if (payload.errors && Object.keys(payload.errors).length > 0) break;

    totalPages = payload.paging?.total ?? 1;
    for (const row of payload.response ?? []) {
      all.push(row as FixtureRow);
    }
    page++;
  }

  return all;
}

export async function syncAllFixturesFromApi(
  supabase: SupabaseClient,
  apiKey: string,
  leagueId: string,
  season: string,
): Promise<{ imported: number; skipped: number; demoRemoved: number }> {
  const fixtures = await fetchAllFixtures(apiKey, leagueId, season);
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

  return { imported, skipped, demoRemoved };
}

export async function syncScoresByStatus(
  supabase: SupabaseClient,
  apiKey: string,
  leagueId: string,
  season: string,
  statusFilter: string,
  recalculateOnFinish: boolean,
): Promise<number> {
  const fixtures = await fetchAllFixtures(apiKey, leagueId, season, statusFilter);
  let updated = 0;

  for (const fx of fixtures) {
    const result = await upsertFixture(supabase, fx, recalculateOnFinish);
    if (result === "finished" || result === "upserted") updated++;
  }

  return updated;
}
