export type TeamAssignmentMode = 'automatic' | 'host'

export function isHostAssignmentMode(mode: TeamAssignmentMode | string | null | undefined): boolean {
  return mode === 'host'
}

export function isAutomaticAssignmentMode(
  mode: TeamAssignmentMode | string | null | undefined,
): boolean {
  return mode !== 'host'
}
