export type PositionFamily = 'GK' | 'DEF' | 'MID' | 'FWD'

export type FormationSlot = {
  /** Stable slot id within the formation, e.g. "DEF1". */
  id: string
  family: PositionFamily
  /** Short pitch label, e.g. GK, DEF, MID, FWD. */
  label: string
}

export type Formation = {
  id: string
  name: string
  /** counts: GK is always 1. */
  def: number
  mid: number
  fwd: number
}

export const FORMATIONS: Formation[] = [
  { id: '4-3-3', name: '4-3-3', def: 4, mid: 3, fwd: 3 },
  { id: '4-4-2', name: '4-4-2', def: 4, mid: 4, fwd: 2 },
  { id: '3-5-2', name: '3-5-2', def: 3, mid: 5, fwd: 2 },
  { id: '5-3-2', name: '5-3-2', def: 5, mid: 3, fwd: 2 },
  { id: '4-5-1', name: '4-5-1', def: 4, mid: 5, fwd: 1 },
  { id: '3-4-3', name: '3-4-3', def: 3, mid: 4, fwd: 3 },
]

export function getFormation(id: string): Formation {
  return FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0]
}

/** Build the ordered 11 slots for a formation. */
export function buildSlots(formation: Formation): FormationSlot[] {
  const slots: FormationSlot[] = [{ id: 'GK1', family: 'GK', label: 'GK' }]
  for (let i = 1; i <= formation.def; i++) slots.push({ id: `DEF${i}`, family: 'DEF', label: 'DEF' })
  for (let i = 1; i <= formation.mid; i++) slots.push({ id: `MID${i}`, family: 'MID', label: 'MID' })
  for (let i = 1; i <= formation.fwd; i++) slots.push({ id: `FWD${i}`, family: 'FWD', label: 'FWD' })
  return slots
}

export const FAMILY_LABEL: Record<PositionFamily, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
}
