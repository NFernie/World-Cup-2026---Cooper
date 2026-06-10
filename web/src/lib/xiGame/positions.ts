import type { PositionFamily } from './formations'
import type { FormationSlot } from './formations'
import type { SquadPlayer } from './types'

/** Buff when a player is in their natural role (e.g. RW in RW). */
export const NATURAL_POSITION_BUFF = 0.05

/** Debuff when a player is in the wrong position family (e.g. RW at CM). */
export const CROSS_FAMILY_DEBUFF = 0.1

const SLOT_ALIASES: Record<string, string[]> = {
  LB: ['LB', 'LWB'],
  RB: ['RB', 'RWB'],
  LWB: ['LWB', 'LB'],
  RWB: ['RWB', 'RB'],
  CB: ['CB'],
  LM: ['LM', 'LW'],
  RM: ['RM', 'RW'],
  LW: ['LW', 'LM', 'LWF'],
  RW: ['RW', 'RM', 'RWF'],
  CM: ['CM', 'CAM', 'CDM'],
  ST: ['ST', 'CF'],
  GK: ['GK'],
}

/** Map API-Football lineup grid + formation to a specific position code. */
export function gridToPositionCode(
  formation: string,
  pos: string,
  grid: string | null | undefined,
): string | null {
  if (!grid) return null
  const parts = formation.split('-').map((n) => parseInt(n, 10))
  if (parts.some((n) => Number.isNaN(n))) return null

  const [row, col] = grid.split(':').map((n) => parseInt(n, 10))
  if (Number.isNaN(row) || Number.isNaN(col)) return null

  const defLine = parts[0]
  const midLine = parts[1]
  const fwdLine = parts[2]

  if (pos === 'G' || row === 1) return 'GK'

  const defRow = 2
  const midRow = defLine <= 3 ? 3 : 3
  const fwdRow = defLine <= 3 ? 4 : defLine === 4 ? 4 : 5

  if (pos === 'D' || row === defRow) {
    if (defLine === 5) {
      if (col === 1) return 'LWB'
      if (col === defLine) return 'RWB'
      return 'CB'
    }
    if (defLine === 3) {
      if (col === 1) return 'LWB'
      if (col === defLine) return 'RWB'
      return 'CB'
    }
    if (col === 1) return 'LB'
    if (col === defLine) return 'RB'
    return 'CB'
  }

  if (pos === 'M' || row === midRow) {
    if (midLine === 1) return 'CM'
    if (col === 1) return 'LM'
    if (col === midLine) return 'RM'
    return 'CM'
  }

  if (pos === 'F' || row >= fwdRow) {
    if (fwdLine === 1) return 'ST'
    if (col === 1) return 'LW'
    if (col === fwdLine) return 'RW'
    return 'ST'
  }

  return null
}

export function familyFromCode(code: string | null | undefined): PositionFamily | null {
  if (!code) return null
  const c = code.toUpperCase()
  if (c === 'GK') return 'GK'
  if (['LB', 'RB', 'CB', 'LWB', 'RWB'].includes(c)) return 'DEF'
  if (['ST', 'CF', 'LW', 'RW'].includes(c)) return 'FWD'
  if (['LM', 'RM', 'CM', 'CAM', 'CDM'].includes(c)) return 'MID'
  return null
}

export function formatPositionLabel(player: Pick<SquadPlayer, 'position' | 'position_code'>): string {
  const family = player.position as PositionFamily
  const code = player.position_code?.toUpperCase()
  if (code && code !== family) return `${code}/${family}`
  return family
}

export type PlacementFit = 'natural' | 'wrong_slot' | 'wrong_family'

export function placementFit(
  player: Pick<SquadPlayer, 'position' | 'position_code'>,
  slot: Pick<FormationSlot, 'family' | 'label'>,
): PlacementFit {
  const code = player.position_code?.toUpperCase() ?? null
  const slotCode = slot.label.toUpperCase()
  const playerFamily = player.position as PositionFamily

  if (code) {
    const aliases = SLOT_ALIASES[slotCode] ?? [slotCode]
    if (aliases.includes(code)) return 'natural'
    const codeFamily = familyFromCode(code)
    if (codeFamily && codeFamily === slot.family) return 'wrong_slot'
    return 'wrong_family'
  }

  if (playerFamily === slot.family) return 'natural'
  return 'wrong_family'
}

/** Rating multiplier offset: +5% natural, 0% same family, −10% wrong family. */
export function placementModifier(fit: PlacementFit): number {
  if (fit === 'natural') return NATURAL_POSITION_BUFF
  if (fit === 'wrong_slot') return 0
  return -CROSS_FAMILY_DEBUFF
}

export function placementHint(fit: PlacementFit): string {
  if (fit === 'natural') return '+5%'
  if (fit === 'wrong_slot') return 'Same area'
  return '−10%'
}
