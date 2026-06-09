import type { Formation } from './formations'
import type { PlacementFit } from './positions'
import { exitRoundLabel } from './simulate'
import type { DraftPick, ExitRound } from './types'
import type { TournamentRunResult } from './matchPresentation'

export type XiGameBanterPick = {
  slotId: string
  slotLabel: string
  slotFamily: string
  placementFit: PlacementFit
  player: {
    id: string
    name: string
    overall_rating: number
    position: string
    position_code: string | null
  }
  team: {
    id: string
    name: string
    fifa_code: string
  }
}

export type XiGameBanterMetadata = {
  type: 'xi_game_result'
  formationId: string
  formationName: string
  squadOvr: number
  outcome: 'won' | 'knocked_out'
  exitRound: ExitRound
  groupRecord: string
  picks: XiGameBanterPick[]
}

export function buildXiGameBanterMetadata(
  picks: DraftPick[],
  formation: Formation,
  result: TournamentRunResult,
): XiGameBanterMetadata {
  return {
    type: 'xi_game_result',
    formationId: formation.id,
    formationName: formation.name,
    squadOvr: result.squadOvr,
    outcome: result.outcome,
    exitRound: result.exitRound,
    groupRecord: result.groupRecord,
    picks: picks.map((p) => ({
      slotId: p.slotId,
      slotLabel: p.slotLabel,
      slotFamily: p.slotFamily,
      placementFit: p.placementFit,
      player: {
        id: p.player.id,
        name: p.player.name,
        overall_rating: p.player.overall_rating,
        position: p.player.position,
        position_code: p.player.position_code,
      },
      team: {
        id: p.team.id,
        name: p.team.name,
        fifa_code: p.team.fifa_code,
      },
    })),
  }
}

export function isXiGameBanterMetadata(value: unknown): value is XiGameBanterMetadata {
  if (!value || typeof value !== 'object') return false
  const v = value as XiGameBanterMetadata
  return v.type === 'xi_game_result' && Array.isArray(v.picks) && typeof v.formationId === 'string'
}

export function metadataToDraftPicks(meta: XiGameBanterMetadata): DraftPick[] {
  return meta.picks.map((p) => ({
    slotId: p.slotId,
    slotFamily: p.slotFamily as DraftPick['slotFamily'],
    slotLabel: p.slotLabel,
    placementFit: p.placementFit,
    player: {
      id: p.player.id,
      team_id: p.team.id,
      name: p.player.name,
      position: p.player.position as DraftPick['player']['position'],
      position_code: p.player.position_code,
      position_detail: null,
      shirt_number: null,
      photo_url: null,
      overall_rating: p.player.overall_rating,
    },
    team: {
      id: p.team.id,
      name: p.team.name,
      fifa_code: p.team.fifa_code,
      global_fifa_rank: null,
    },
  }))
}

export function banterSummaryText(result: TournamentRunResult, formation: Formation): string {
  if (result.outcome === 'won') {
    return `🏆 Won the World Cup! ${formation.name} · Rating ${result.squadOvr} · ${result.groupRecord}`
  }
  return `😤 Out in the ${exitRoundLabel(result.exitRound)} · ${formation.name} · Rating ${result.squadOvr} · ${result.groupRecord}`
}
