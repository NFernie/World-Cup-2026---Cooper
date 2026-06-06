/** Whether the current pool member is on this team row. */
export function isYourTeamRow(
  poolMemberId: string | undefined,
  poolMemberIds: string[] | null | undefined,
): boolean {
  if (!poolMemberId || !poolMemberIds?.length) return false
  return poolMemberIds.includes(poolMemberId)
}

export function formatStage(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ')
}

export const STAGE_LABELS: Record<string, string> = {
  group: 'Group stage',
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter-final',
  semi_final: 'Semi-final',
  third_place: 'Third place',
  final: 'Final',
}

export const STAGE_FILTER_OPTIONS = [
  { value: '', label: 'All rounds' },
  { value: 'group', label: 'Group stage' },
  { value: 'round_of_32', label: 'Round of 32' },
  { value: 'round_of_16', label: 'Round of 16' },
  { value: 'quarter_final', label: 'Quarter-final' },
  { value: 'semi_final', label: 'Semi-final' },
  { value: 'third_place', label: 'Third place' },
  { value: 'final', label: 'Final' },
] as const

export function kickoffDateKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDateFilterLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
