/**
 * Daily WC match form sync — updates form_boost_pct only (never baseline overall_rating).
 * Uses latest match per player; national WC fixtures from public.matches only.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  FORM_DECAY_DAYS,
  FORM_MIN_MINUTES,
  matchRatingToBoostPct,
  parseMatchRating,
  parseMinutes,
} from "../../_shared/form-boost.ts";

const API_BASE = "https://v3.football.api-sports.io";
const FORM_META_KEY = "spin_draft_form_sync";

type DbMatch = {
  id: string;
  external_id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  status: string;
};

type DbTeam = {
  id: string;
  api_football_team_id: number | null;
};

type DbPlayer = {
  id: string;
  team_id: string;
  api_football_player_id: number | null;
  overall_rating: number;
  form_boost_pct: number | null;
  form_synced_at: string | null;
};

type PlayerMatchRow = {
  playerId: number;
  rating: number;
  minutes: number;
  fixtureId: string;
  kickoffAt: string;
  teamId: string;
};

function apiHeaders(apiKey: string) {
  return { "x-apisports-key": apiKey };
}

function maxFixturesPerRun(): number {
  const n = parseInt(Deno.env.get("FORM_SYNC_MAX_FIXTURES_PER_RUN") ?? "10", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 10;
}

function formBudgetMs(): number {
  const n = parseInt(Deno.env.get("FORM_SYNC_BUDGET_MS") ?? "90000", 10);
  return Number.isFinite(n) && n > 10_000 ? Math.min(n, 120_000) : 90_000;
}

async function fetchFixturePlayerRatings(
  apiKey: string,
  fixtureId: string,
): Promise<
  {
    playerId: number;
    rating: number;
    minutes: number;
    teamApiId: number;
  }[]
> {
  const res = await fetch(`${API_BASE}/fixtures/players?fixture=${fixtureId}`, {
    headers: apiHeaders(apiKey),
  });
  if (!res.ok) return [];

  const payload = await res.json().catch(() => null);
  const teams = (payload?.response ?? []) as Record<string, unknown>[];
  const out: {
    playerId: number;
    rating: number;
    minutes: number;
    teamApiId: number;
  }[] = [];

  for (const teamBlock of teams) {
    const team = teamBlock.team as Record<string, unknown> | undefined;
    const teamApiId = team?.id as number | undefined;
    if (!teamApiId) continue;

    const players = (teamBlock.players ?? []) as Record<string, unknown>[];
    for (const row of players) {
      const player = row.player as Record<string, unknown> | undefined;
      const playerId = player?.id as number | undefined;
      if (!playerId) continue;

      const stats = (row.statistics ?? []) as Record<string, unknown>[];
      const games = (stats[0]?.games ?? {}) as Record<string, unknown>;
      const rating = parseMatchRating(games.rating);
      const minutes = parseMinutes(games.minutes);
      if (rating == null) continue;

      out.push({ playerId, rating, minutes, teamApiId });
    }
  }

  return out;
}

export async function syncSquadForm(
  supabase: SupabaseClient,
  apiKey: string,
  opts: { force?: boolean } = {},
): Promise<{
  fixturesProcessed: number;
  playersUpdated: number;
  playersCleared: number;
  playersDecayed: number;
  apiCalls: number;
  budgetReached?: boolean;
  lastFormSyncAt: string | null;
  note?: string;
}> {
  const force = opts.force === true;
  const startedAt = Date.now();
  const budgetMs = formBudgetMs();
  const maxFixtures = maxFixturesPerRun();

  const metaResult = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", FORM_META_KEY)
    .maybeSingle();

  const lastFormSyncAt =
    (metaResult.data?.value as { last_synced_at?: string } | null)?.last_synced_at ?? null;

  const watermark = force ? "1970-01-01T00:00:00.000Z" : (lastFormSyncAt ?? "1970-01-01T00:00:00.000Z");

  const [teamsResult, playersResult, matchesResult] = await Promise.all([
    supabase.from("teams").select("id, api_football_team_id").not("api_football_team_id", "is", null),
    supabase
      .from("squad_players")
      .select("id, team_id, api_football_player_id, overall_rating, form_boost_pct, form_synced_at")
      .not("api_football_player_id", "is", null),
    supabase
      .from("matches")
      .select("id, external_id, home_team_id, away_team_id, kickoff_at, status")
      .eq("status", "finished")
      .not("external_id", "is", null)
      .gt("kickoff_at", watermark)
      .order("kickoff_at", { ascending: true }),
  ]);

  if (teamsResult.error) throw new Error(teamsResult.error.message);
  if (playersResult.error) throw new Error(playersResult.error.message);
  if (matchesResult.error) throw new Error(matchesResult.error.message);

  const teamById = new Map((teamsResult.data ?? []).map((t) => [t.id as string, t as DbTeam]));
  const apiTeamToDbTeam = new Map<number, string>();
  for (const t of teamsResult.data ?? []) {
    if (t.api_football_team_id != null) {
      apiTeamToDbTeam.set(t.api_football_team_id as number, t.id as string);
    }
  }

  const players = (playersResult.data ?? []) as DbPlayer[];
  const playerByApiId = new Map<number, DbPlayer>();
  for (const p of players) {
    if (p.api_football_player_id != null) playerByApiId.set(p.api_football_player_id, p);
  }

  const matches = ((matchesResult.data ?? []) as DbMatch[])
    .filter((m) => m.external_id)
    .slice(0, maxFixtures);

  // Latest match row per api player id (national WC fixtures only).
  const latestByPlayer = new Map<number, PlayerMatchRow>();
  const teamLatestFixture = new Map<string, { kickoffAt: string; fixtureId: string }>();
  const appearedInTeamLatest = new Map<string, Set<number>>();
  let apiCalls = 0;
  let budgetReached = false;

  const markTeamFixture = (teamId: string, kickoffAt: string, fixtureId: string) => {
    const prev = teamLatestFixture.get(teamId);
    if (!prev || kickoffAt > prev.kickoffAt) {
      teamLatestFixture.set(teamId, { kickoffAt, fixtureId });
      appearedInTeamLatest.set(teamId, new Set());
    }
  };

  for (const match of matches) {
    if (Date.now() - startedAt > budgetMs) {
      budgetReached = true;
      break;
    }

    const homeTeam = teamById.get(match.home_team_id);
    const awayTeam = teamById.get(match.away_team_id);
    if (!homeTeam?.api_football_team_id || !awayTeam?.api_football_team_id) continue;

    markTeamFixture(match.home_team_id, match.kickoff_at, match.external_id);
    markTeamFixture(match.away_team_id, match.kickoff_at, match.external_id);

    const rows = await fetchFixturePlayerRatings(apiKey, match.external_id);
    apiCalls += 1;
    await new Promise((r) => setTimeout(r, 120));

    for (const row of rows) {
      const dbTeamId = apiTeamToDbTeam.get(row.teamApiId);
      if (!dbTeamId) continue;
      if (dbTeamId !== match.home_team_id && dbTeamId !== match.away_team_id) continue;

      const latest = teamLatestFixture.get(dbTeamId);
      if (latest?.fixtureId === match.external_id) {
        appearedInTeamLatest.get(dbTeamId)?.add(row.playerId);
      }

      const player = playerByApiId.get(row.playerId);
      if (!player || player.team_id !== dbTeamId) continue;

      const existing = latestByPlayer.get(row.playerId);
      if (!existing || match.kickoff_at > existing.kickoffAt) {
        latestByPlayer.set(row.playerId, {
          playerId: row.playerId,
          rating: row.rating,
          minutes: row.minutes,
          fixtureId: match.external_id,
          kickoffAt: match.kickoff_at,
          teamId: dbTeamId,
        });
      }
    }
  }

  const now = new Date().toISOString();
  const decayBefore = new Date(Date.now() - FORM_DECAY_DAYS * 86_400_000).toISOString();
  let playersUpdated = 0;
  let playersCleared = 0;
  let playersDecayed = 0;
  const updatedPlayerIds = new Set<string>();

  for (const [apiPlayerId, matchRow] of latestByPlayer) {
    const player = playerByApiId.get(apiPlayerId);
    if (!player) continue;

    let newBoost = 0;
    let reason = "dnp_or_low_minutes";

    if (matchRow.minutes >= FORM_MIN_MINUTES) {
      newBoost = matchRatingToBoostPct(matchRow.rating);
      reason = "latest_match";
    }

    const oldBoost = Number(player.form_boost_pct ?? 0);
    if (oldBoost !== newBoost || player.form_synced_at == null) {
      const { error } = await supabase
        .from("squad_players")
        .update({
          form_boost_pct: newBoost,
          form_match_rating: matchRow.minutes >= FORM_MIN_MINUTES ? matchRow.rating : null,
          form_fixture_ids: [matchRow.fixtureId],
          form_synced_at: now,
        })
        .eq("id", player.id);

      if (!error) {
        updatedPlayerIds.add(player.id);
        if (newBoost === 0 && oldBoost !== 0) playersCleared += 1;
        else playersUpdated += 1;

        await supabase.from("squad_player_form_log").insert({
          squad_player_id: player.id,
          api_football_player_id: apiPlayerId,
          fixture_external_id: matchRow.fixtureId,
          match_rating: matchRow.minutes >= FORM_MIN_MINUTES ? matchRow.rating : null,
          minutes: matchRow.minutes,
          old_boost_pct: oldBoost,
          new_boost_pct: newBoost,
          reason,
        });
      }
    } else {
      updatedPlayerIds.add(player.id);
    }
  }

  // DNP: squad player not in team's latest processed fixture → clear form.
  for (const player of players) {
    if (updatedPlayerIds.has(player.id)) continue;
    if (player.api_football_player_id == null) continue;

    const latest = teamLatestFixture.get(player.team_id);
    if (!latest) continue;

    const appeared = appearedInTeamLatest.get(player.team_id);
    if (appeared?.has(player.api_football_player_id)) continue;

    const oldBoost = Number(player.form_boost_pct ?? 0);
    if (oldBoost === 0 && player.form_synced_at != null) continue;

    const { error } = await supabase
      .from("squad_players")
      .update({
        form_boost_pct: 0,
        form_match_rating: null,
        form_fixture_ids: [latest.fixtureId],
        form_synced_at: now,
      })
      .eq("id", player.id);

    if (!error) {
      updatedPlayerIds.add(player.id);
      playersCleared += 1;
      await supabase.from("squad_player_form_log").insert({
        squad_player_id: player.id,
        api_football_player_id: player.api_football_player_id,
        fixture_external_id: latest.fixtureId,
        old_boost_pct: oldBoost,
        new_boost_pct: 0,
        reason: "dnp_latest_fixture",
      });
    }
  }

  // Decay: no new match in 3+ days → clear form.
  for (const player of players) {
    if (updatedPlayerIds.has(player.id)) continue;
    if (!player.form_synced_at || player.form_synced_at > decayBefore) continue;
    const oldBoost = Number(player.form_boost_pct ?? 0);
    if (oldBoost === 0) continue;

    const { error } = await supabase
      .from("squad_players")
      .update({
        form_boost_pct: 0,
        form_match_rating: null,
        form_fixture_ids: null,
        form_synced_at: now,
      })
      .eq("id", player.id);

    if (!error) {
      playersDecayed += 1;
      await supabase.from("squad_player_form_log").insert({
        squad_player_id: player.id,
        api_football_player_id: player.api_football_player_id,
        old_boost_pct: oldBoost,
        new_boost_pct: 0,
        reason: "decay_3d",
      });
    }
  }

  const newWatermark = matches.length > 0
    ? matches[matches.length - 1].kickoff_at
    : now;

  await supabase.from("app_settings").upsert({
    key: FORM_META_KEY,
    value: { last_synced_at: newWatermark },
    updated_at: now,
  }, { onConflict: "key" });

  return {
    fixturesProcessed: matches.length,
    playersUpdated,
    playersCleared,
    playersDecayed,
    apiCalls,
    budgetReached: budgetReached || undefined,
    lastFormSyncAt: newWatermark,
    note: matches.length === 0
      ? "No new FT WC matches since last form sync."
      : undefined,
  };
}
