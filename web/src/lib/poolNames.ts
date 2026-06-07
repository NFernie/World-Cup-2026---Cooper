export type PoolNameVisibility = {
  revealNames: boolean
  hostUserId: string
  viewerUserId: string | undefined
}

export function canSeeMemberName(
  visibility: PoolNameVisibility,
  memberUserId: string,
): boolean {
  if (visibility.revealNames) return true
  if (!visibility.viewerUserId) return false
  if (visibility.viewerUserId === visibility.hostUserId) return true
  if (visibility.viewerUserId === memberUserId) return true
  return false
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
