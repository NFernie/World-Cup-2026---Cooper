import { openSlots, spinTeam } from './draft'
import type { Formation } from './formations'
import { placementFit, placementPenalty } from './positions'
import { buildDraftPick, type DraftPick, type GameTeam, type SquadPlayer } from './types'

const FIT_WEIGHT = 10_000

function fitPriority(fit: ReturnType<typeof placementFit>): number {
  if (fit === 'natural') return 3
  if (fit === 'wrong_slot') return 2
  return 1
}

function projectedRating(player: SquadPlayer, slot: Parameters<typeof placementFit>[1]): number {
  const fit = placementFit(player, slot)
  const penalty = placementPenalty(fit)
  return Math.round(player.overall_rating * (1 - penalty))
}

export type AutoDraftRound = {
  round: number
  team: GameTeam
  pick: DraftPick
}

/**
 * Spin 11 nations and auto-place each drafted player into the best open slot,
 * prioritising natural fit, then same-family (−5%), then cross-family (−10%).
 */
export function autoDraftTeam(
  formation: Formation,
  teams: GameTeam[],
  squadsByTeam: Map<string, SquadPlayer[]>,
  rng: () => number = Math.random,
): DraftPick[] {
  const eligible = teams.filter((t) => (squadsByTeam.get(t.id)?.length ?? 0) > 0)
  const picks: DraftPick[] = []

  for (let round = 0; round < 11; round++) {
    const usedTeamIds = picks.map((p) => p.team.id)
    const usedPlayerIds = new Set(picks.map((p) => p.player.id))
    const team = spinTeam(eligible, usedTeamIds, rng)
    const squad = (squadsByTeam.get(team.id) ?? []).filter((p) => !usedPlayerIds.has(p.id))
    const slots = openSlots(formation, picks)

    let best: { slot: (typeof slots)[0]; player: SquadPlayer; score: number } | null = null

    for (const slot of slots) {
      for (const player of squad) {
        const fit = placementFit(player, slot)
        const score = fitPriority(fit) * FIT_WEIGHT + projectedRating(player, slot)
        if (!best || score > best.score) {
          best = { slot, player, score }
        }
      }
    }

    if (best) {
      picks.push(buildDraftPick(best.slot, best.player, team))
    }
  }

  return picks
}

/** Same as autoDraftTeam but returns per-round detail for spin animation. */
export function autoDraftWithRounds(
  formation: Formation,
  teams: GameTeam[],
  squadsByTeam: Map<string, SquadPlayer[]>,
  rng: () => number = Math.random,
): AutoDraftRound[] {
  const picks = autoDraftTeam(formation, teams, squadsByTeam, rng)
  return picks.map((pick, i) => ({
    round: i + 1,
    team: pick.team,
    pick,
  }))
}
