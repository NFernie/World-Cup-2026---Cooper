import type { SquadPlayer } from './types'

const WC_SQUAD_SIZE = 26

/** Loose blend: FIFA rank anchor vs Top-11 squad average (Phase 1). */
export const FIFA_TEAM_OVR_WEIGHT = 0.55
export const TOP11_TEAM_OVR_WEIGHT = 0.45

/** Decay weights for star-weighted Top-11 (rank 1 heaviest). Phase 3. */
export const STAR_TOP11_WEIGHTS = [
  1.0, 0.965, 0.93, 0.895, 0.86, 0.825, 0.79, 0.755, 0.72, 0.685, 0.65,
] as const

/** Nation OVR from FIFA world ranking (same curve as sync fallback). */
export function fifaTeamOvr(globalFifaRank: number | null | undefined): number {
  if (globalFifaRank == null || globalFifaRank <= 0) return 70
  return Math.round(Math.min(86, Math.max(58, 86 - (globalFifaRank - 1) * 0.32)))
}

/** Rated players only; capped at a typical 26-man World Cup squad. */
export function squadPlayersForTeamRating(players: SquadPlayer[]): SquadPlayer[] {
  return players
    .filter((p) => p.overall_rating > 0)
    .sort((a, b) => b.overall_rating - a.overall_rating)
    .slice(0, WC_SQUAD_SIZE)
}

/**
 * Team strength from the mean overall_rating of up to 26 rated squad players.
 */
export function teamSquadAverageRating(players: SquadPlayer[]): number {
  const squad = squadPlayersForTeamRating(players)
  if (squad.length === 0) return 0
  const sum = squad.reduce((total, p) => total + p.overall_rating, 0)
  return Math.round(sum / squad.length)
}

/** Best XI by position families (1 GK, 4 DEF, 3 MID, 3 FWD). */
export function teamBestXIAverageRating(players: SquadPlayer[]): number {
  const squad = squadPlayersForTeamRating(players)
  if (squad.length === 0) return 0

  const byFamily = {
    GK: squad.filter((p) => p.position === 'GK'),
    DEF: squad.filter((p) => p.position === 'DEF'),
    MID: squad.filter((p) => p.position === 'MID'),
    FWD: squad.filter((p) => p.position === 'FWD'),
  }

  const xi: SquadPlayer[] = []
  if (byFamily.GK[0]) xi.push(byFamily.GK[0])
  xi.push(...byFamily.DEF.slice(0, 4))
  xi.push(...byFamily.MID.slice(0, 3))
  xi.push(...byFamily.FWD.slice(0, 3))

  if (xi.length === 0) return teamSquadAverageRating(players)
  const sum = xi.reduce((total, p) => total + p.overall_rating, 0)
  return Math.round(sum / xi.length)
}

/** Flat mean of top 11 rated players. */
export function teamTop11AverageRating(players: SquadPlayer[]): number {
  const squad = squadPlayersForTeamRating(players)
  const top = squad.slice(0, 11)
  if (top.length === 0) return 0
  const sum = top.reduce((total, p) => total + p.overall_rating, 0)
  return Math.round(sum / top.length)
}

/**
 * Star-weighted Top-11 — top players count more than depth (Phase 3).
 */
export function teamStarWeightedTop11Rating(players: SquadPlayer[]): number {
  const squad = squadPlayersForTeamRating(players)
  const top = squad.slice(0, 11)
  if (top.length === 0) return 0

  let weightedSum = 0
  let weightTotal = 0
  for (let i = 0; i < top.length; i++) {
    const w = STAR_TOP11_WEIGHTS[i] ?? STAR_TOP11_WEIGHTS[STAR_TOP11_WEIGHTS.length - 1]
    weightedSum += top[i].overall_rating * w
    weightTotal += w
  }
  return Math.round(weightedSum / weightTotal)
}

/**
 * Tournament opponent strength: 55% FIFA rank anchor + 45% star-weighted Top-11.
 * Falls back to FIFA-only when no rated players exist.
 */
export function teamAnchoredOvr(
  players: SquadPlayer[],
  globalFifaRank: number | null | undefined,
): number {
  const fifa = fifaTeamOvr(globalFifaRank)
  const top11 = teamStarWeightedTop11Rating(players)
  if (top11 <= 0) return fifa
  return Math.round(FIFA_TEAM_OVR_WEIGHT * fifa + TOP11_TEAM_OVR_WEIGHT * top11)
}
