import type { Formation, FormationSlot } from './formations'
import { buildSlots } from './formations'
import type { DraftPick, GameTeam } from './types'

/** Pick a random team id, excluding already-spun teams when possible. */
export function spinTeam(teams: GameTeam[], usedTeamIds: string[], rng = Math.random): GameTeam {
  const fresh = teams.filter((t) => !usedTeamIds.includes(t.id))
  const pool = fresh.length > 0 ? fresh : teams
  return pool[Math.floor(rng() * pool.length)]
}

/** Open slots remaining given the formation and current picks. */
export function openSlots(formation: Formation, picks: DraftPick[]): FormationSlot[] {
  const filled = new Set(picks.map((p) => p.slotId))
  return buildSlots(formation).filter((s) => !filled.has(s.id))
}

export function isComplete(formation: Formation, picks: DraftPick[]): boolean {
  return openSlots(formation, picks).length === 0
}
