export type PositionFamily = 'GK' | 'DEF' | 'MID' | 'FWD'

export type FormationSlot = {
  /** Stable slot id within the formation, e.g. "DEF1". */
  id: string
  family: PositionFamily
  /** Specific pitch label, e.g. GK, LB, CB, CM, RW, ST. */
  label: string
}

export type Formation = {
  id: string
  name: string
  /** Detailed slot labels per family (GK is always a single slot). */
  def: string[]
  mid: string[]
  fwd: string[]
}

export const FORMATIONS: Formation[] = [
  { id: '4-3-3', name: '4-3-3', def: ['LB', 'CB', 'CB', 'RB'], mid: ['LM', 'CM', 'RM'], fwd: ['LW', 'ST', 'RW'] },
  { id: '4-4-2', name: '4-4-2', def: ['LB', 'CB', 'CB', 'RB'], mid: ['LM', 'CM', 'CM', 'RM'], fwd: ['ST', 'ST'] },
  { id: '3-5-2', name: '3-5-2', def: ['CB', 'CB', 'CB'], mid: ['LM', 'CM', 'CM', 'CM', 'RM'], fwd: ['ST', 'ST'] },
  { id: '5-3-2', name: '5-3-2', def: ['LWB', 'CB', 'CB', 'CB', 'RWB'], mid: ['CM', 'CM', 'CM'], fwd: ['ST', 'ST'] },
  { id: '4-5-1', name: '4-5-1', def: ['LB', 'CB', 'CB', 'RB'], mid: ['LM', 'CM', 'CM', 'CM', 'RM'], fwd: ['ST'] },
  { id: '3-4-3', name: '3-4-3', def: ['CB', 'CB', 'CB'], mid: ['LM', 'CM', 'CM', 'RM'], fwd: ['LW', 'ST', 'RW'] },
]

export function getFormation(id: string): Formation {
  return FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0]
}

/** All 11 slots (GK, DEF, MID, FWD order). */
export function buildSlots(formation: Formation): FormationSlot[] {
  const slots: FormationSlot[] = [{ id: 'GK1', family: 'GK', label: 'GK' }]
  formation.def.forEach((label, i) => slots.push({ id: `DEF${i + 1}`, family: 'DEF', label }))
  formation.mid.forEach((label, i) => slots.push({ id: `MID${i + 1}`, family: 'MID', label }))
  formation.fwd.forEach((label, i) => slots.push({ id: `FWD${i + 1}`, family: 'FWD', label }))
  return slots
}

/** Pitch rows top → bottom: forwards, midfielders, defenders, goalkeeper. */
export function pitchRows(formation: Formation): FormationSlot[][] {
  const slots = buildSlots(formation)
  const byFamily = (family: PositionFamily) => slots.filter((s) => s.family === family)
  return [byFamily('FWD'), byFamily('MID'), byFamily('DEF'), byFamily('GK')]
}

export const FAMILY_LABEL: Record<PositionFamily, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
}

/** Rating penalty applied when a player is placed outside their natural family. */
export const OUT_OF_POSITION_PENALTY = 0.1
