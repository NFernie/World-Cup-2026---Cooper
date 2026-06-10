import type { SquadPlayer } from './types'

const WC_SQUAD_SIZE = 26

/** Rated players only; capped at a typical 26-man World Cup squad. */
export function squadPlayersForTeamRating(players: SquadPlayer[]): SquadPlayer[] {
  return players
    .filter((p) => p.overall_rating > 0)
    .sort((a, b) => b.overall_rating - a.overall_rating)
    .slice(0, WC_SQUAD_SIZE)
}

/**
 * Team strength from the mean overall_rating of up to 26 rated squad players.
 * This is the default opponent (and can be used for nation) team rating.
 */
export function teamSquadAverageRating(players: SquadPlayer[]): number {
  const squad = squadPlayersForTeamRating(players)
  if (squad.length === 0) return 0
  const sum = squad.reduce((total, p) => total + p.overall_rating, 0)
  return Math.round(sum / squad.length)
}

/** Best XI by position families (1 GK, 4 DEF, 3 MID, 3 FWD) — alternative team rating. */
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

/** Top 11 rated outfield+GK players — alternative when positions are thin. */
export function teamTop11AverageRating(players: SquadPlayer[]): number {
  const squad = squadPlayersForTeamRating(players)
  const top = squad.slice(0, 11)
  if (top.length === 0) return 0
  const sum = top.reduce((total, p) => total + p.overall_rating, 0)
  return Math.round(sum / top.length)
}
