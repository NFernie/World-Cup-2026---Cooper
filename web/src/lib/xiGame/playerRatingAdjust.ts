import { leagueRatingMultiplier } from './leagueTiers'
import { fifaTeamOvr } from './teamRating'
import type { SquadPlayer } from './types'

export const NATION_CLAMP_BELOW = 8
export const NATION_CLAMP_ABOVE = 12
export const STAR_TOP_N = 3
export const STAR_FLOOR_ABOVE_FIFA = 6
const PLAYER_OVR_MIN = 50
const PLAYER_OVR_MAX = 94

export type SquadPlayerRow = SquadPlayer & {
  rating_source?: string | null
  baseline_league_id?: number | null
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function nationBounds(fifaOvr: number): { min: number; max: number } {
  return {
    min: fifaOvr - NATION_CLAMP_BELOW,
    max: fifaOvr + NATION_CLAMP_ABOVE,
  }
}

function applyLeagueAndNationClamp(
  raw: number,
  fifaOvr: number,
  leagueId: number | null | undefined,
  ratingSource: string | null | undefined,
): number {
  if (ratingSource === 'manual') {
    return clamp(raw, PLAYER_OVR_MIN, PLAYER_OVR_MAX)
  }
  if (raw <= 0) return raw

  const mult = leagueRatingMultiplier(leagueId, ratingSource)
  const { min, max } = nationBounds(fifaOvr)
  const scaled = Math.round(raw * mult)
  return clamp(scaled, Math.max(PLAYER_OVR_MIN, min), Math.min(PLAYER_OVR_MAX, max))
}

/**
 * League multiplier → nation clamp → top-3 star floor per nation.
 * Applied at read time; no API calls.
 */
export function applySquadRatingAdjustments(
  players: SquadPlayerRow[],
  fifaRankByTeamId: Map<string, number | null>,
): SquadPlayer[] {
  const byTeam = new Map<string, SquadPlayerRow[]>()
  for (const p of players) {
    const list = byTeam.get(p.team_id) ?? []
    list.push(p)
    byTeam.set(p.team_id, list)
  }

  const adjustedById = new Map<string, number>()

  for (const [teamId, squad] of byTeam) {
    const fifaOvr = fifaTeamOvr(fifaRankByTeamId.get(teamId))
    const { min, max } = nationBounds(fifaOvr)
    const starFloor = fifaOvr + STAR_FLOOR_ABOVE_FIFA

    const starIds = new Set(
      [...squad]
        .filter((p) => p.overall_rating >= fifaOvr - NATION_CLAMP_BELOW)
        .sort((a, b) => b.overall_rating - a.overall_rating)
        .slice(0, STAR_TOP_N)
        .map((p) => p.id),
    )

    const withLeague = squad.map((p) => ({
      player: p,
      leagued: applyLeagueAndNationClamp(
        p.overall_rating,
        fifaOvr,
        p.baseline_league_id,
        p.rating_source,
      ),
    }))

    for (const { player, leagued } of withLeague) {
      let ovr = leagued
      if (starIds.has(player.id) && player.rating_source !== 'manual') {
        ovr = Math.max(ovr, starFloor)
      }
      ovr = clamp(ovr, Math.max(PLAYER_OVR_MIN, min), Math.min(PLAYER_OVR_MAX, max))
      adjustedById.set(player.id, ovr)
    }
  }

  return players.map((p) => ({
    ...p,
    overall_rating: adjustedById.get(p.id) ?? p.overall_rating,
  }))
}
