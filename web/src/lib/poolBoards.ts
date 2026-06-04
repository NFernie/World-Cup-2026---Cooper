/** Whether the current pool member is on this team row. */
export function isYourTeamRow(
  poolMemberId: string | undefined,
  poolMemberIds: string[] | null | undefined,
): boolean {
  if (!poolMemberId || !poolMemberIds?.length) return false
  return poolMemberIds.includes(poolMemberId)
}

export function formatStage(stage: string): string {
  return stage.replace(/_/g, ' ')
}
