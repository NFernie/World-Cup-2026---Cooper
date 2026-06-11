import { placementFit, placementModifier, type PlacementFit } from './positions'
import type { PositionFamily } from './formations'
import type { FormationSlot } from './formations'

export type SquadPlayer = {
  id: string
  team_id: string
  name: string
  position: PositionFamily
  /** Specific role when known, e.g. LB, ST. */
  position_code: string | null
  position_detail: string | null
  shirt_number: number | null
  photo_url: string | null
  /** Final adjusted OVR shown in game (includes form + league/clamp/star floor). */
  overall_rating: number
  /** DB baseline raw before form boost (for tooltips). */
  stored_rating?: number
  rating_source?: string | null
  form_boost_pct?: number | null
  form_match_rating?: number | null
}

export type GameTeam = {
  id: string
  name: string
  fifa_code: string
  global_fifa_rank: number | null
}

export type DraftPick = {
  slotId: string
  slotFamily: PositionFamily
  slotLabel: string
  player: SquadPlayer
  team: GameTeam
  placementFit: PlacementFit
}

export function buildDraftPick(
  slot: FormationSlot,
  player: SquadPlayer,
  team: GameTeam,
): DraftPick {
  const fit = placementFit(player, slot)
  return {
    slotId: slot.id,
    slotFamily: slot.family,
    slotLabel: slot.label,
    player,
    team,
    placementFit: fit,
  }
}

/** Player rating after natural-position buff or out-of-position debuff. */
export function effectiveRating(pick: DraftPick): number {
  const modifier = placementModifier(pick.placementFit)
  if (modifier === 0) return pick.player.overall_rating
  return Math.round(pick.player.overall_rating * (1 + modifier))
}

export type ExitRound =
  | 'group'
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter_final'
  | 'semi_final'
  | 'final'
  | 'champion'

export type SimulationResult = {
  outcome: 'won' | 'knocked_out'
  exitRound: ExitRound
  squadOvr: number
  groupRecord: string
}

export type TournamentMatchPreview = {
  id: string
  stage: ExitRound
  stageLabel: string
  opponentName: string
  opponentOvr: number
  isKnockout: boolean
  groupIndex?: number
}
