import type { PositionFamily } from './formations'

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
  family: PositionFamily
  player: SquadPlayer
  team: GameTeam
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
