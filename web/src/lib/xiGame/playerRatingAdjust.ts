import { applyFormBoostToRaw } from './formBoost'
import { leagueRatingMultiplier } from './leagueTiers'
import { fifaTeamOvr } from './teamRating'
import type { SquadPlayer } from './types'

export const NATION_CLAMP_BELOW = 8
export const NATION_CLAMP_ABOVE = 12
export const STAR_TOP_N = 3
export const STAR_FLOOR_ABOVE_FIFA = 6
/** Pull star-floor boost halfway toward fifa+6 (e.g. 81 → 87 not 92). */
export const STAR_FLOOR_BLEND = 0.5
const PLAYER_OVR_MIN = 50
const PLAYER_OVR_MAX = 94

export type SquadPlayerRow = SquadPlayer & {
  /** DB baseline raw — same as overall_rating column before read-time adjust. */
  overall_rating: number
  rating_source?: string | null
  baseline_league_id?: number | null
  has_continental_rating?: boolean | null
  form_boost_pct?: number | null
  form_match_rating?: number | null
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

/** Star pool uses stored DB raw — not form-boosted effective raw. */
function qualifiesForStarPool(player: SquadPlayerRow, storedRaw: number, fifaOvr: number): boolean {
  if (player.rating_source === 'continental_2025') return true
  if (player.has_continental_rating) return true
  return storedRaw >= fifaOvr - NATION_CLAMP_BELOW
}

function applyStarFloor(leagued: number, starFloor: number): number {
  if (leagued >= starFloor) return leagued
  return Math.round(leagued + (starFloor - leagued) * STAR_FLOOR_BLEND)
}

/**
 * Form boost on raw → league multiplier → nation clamp → top-3 star floor (half blend).
 * Star pool eligibility uses stored baseline raw only.
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
        .filter((p) => qualifiesForStarPool(p, p.overall_rating, fifaOvr))
        .sort((a, b) => b.overall_rating - a.overall_rating)
        .slice(0, STAR_TOP_N)
        .map((p) => p.id),
    )

    const withLeague = squad.map((p) => {
      const storedRaw = p.overall_rating
      const effectiveRaw = applyFormBoostToRaw(storedRaw, p.form_boost_pct ?? 0)
      return {
        player: p,
        storedRaw,
        leagued: applyLeagueAndNationClamp(
          effectiveRaw,
          fifaOvr,
          p.baseline_league_id,
          p.rating_source,
        ),
      }
    })

    for (const { player, leagued } of withLeague) {
      let ovr = leagued
      if (starIds.has(player.id) && player.rating_source !== 'manual') {
        ovr = applyStarFloor(leagued, starFloor)
      }
      ovr = clamp(ovr, Math.max(PLAYER_OVR_MIN, min), Math.min(PLAYER_OVR_MAX, max))
      adjustedById.set(player.id, ovr)
    }
  }

  return players.map((p) => ({
    ...p,
    stored_rating: p.overall_rating,
    overall_rating: adjustedById.get(p.id) ?? p.overall_rating,
  }))
}
