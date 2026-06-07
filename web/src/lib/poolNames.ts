export type PoolNameVisibility = {
  revealNames: boolean
  hostUserId: string
  viewerUserId: string | undefined
}

/** Treat null/undefined as hidden — safe for groups created before reveal_names existed. */
export function isRevealNamesEnabled(value: boolean | null | undefined): boolean {
  return value === true
}

export function canSeeMemberName(
  visibility: PoolNameVisibility,
  memberUserId: string,
): boolean {
  if (visibility.revealNames) return true
  if (!visibility.viewerUserId || !memberUserId) return false
  return visibility.viewerUserId === memberUserId
}

export function maskMemberName(
  displayName: string,
  visibility: PoolNameVisibility,
  memberUserId: string,
): string {
  return canSeeMemberName(visibility, memberUserId) ? displayName : 'Hidden player'
}

export function maskManagerNames(
  names: string[],
  memberUserIds: string[],
  visibility: PoolNameVisibility,
): string[] {
  return names.map((name, index) =>
    maskMemberName(name, visibility, memberUserIds[index] ?? ''),
  )
}

export function formatManagerLine(
  managerLabels: string[],
  memberIds: string[],
  playerCount: number,
  visibility: PoolNameVisibility,
  viewerMemberId: string | undefined,
): string {
  if (visibility.revealNames) {
    return `Managers: ${managerLabels.join(', ')}`
  }
  const youIdx = viewerMemberId ? memberIds.findIndex((id) => id === viewerMemberId) : -1
  if (youIdx >= 0) {
    return `Managers: ${managerLabels[youIdx]} (you)`
  }
  return `Players assigned ${playerCount}`
}
