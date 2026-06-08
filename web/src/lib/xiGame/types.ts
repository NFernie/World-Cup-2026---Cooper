import { OUT_OF_POSITION_PENALTY, type PositionFamily } from './formations'

export type SquadPlayer = {
  id: string
  team_id: string
  name: string
  position: PositionFamily
  position_detail: string | null
  shirt_number: number | null
  photo_url: string | null
  overall_rating: number
}

export type GameTeam = {
  id: string
  name: string
  fifa_code: string
  global_fifa_rank: number | null
}

export type DraftPick = {
  slotId: string
  /** Family of the slot the player was placed in. */
  slotFamily: PositionFamily
  /** Specific slot label, e.g. RW. */
  slotLabel: string
  player: SquadPlayer
  team: GameTeam
  /** True when the player's natural family differs from the slot family. */
  outOfPosition: boolean
}

/** Player rating after the out-of-position penalty is applied. */
export function effectiveRating(pick: DraftPick): number {
  if (!pick.outOfPosition) return pick.player.overall_rating
  return Math.round(pick.player.overall_rating * (1 - OUT_OF_POSITION_PENALTY))
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
