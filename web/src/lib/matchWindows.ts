/** Show on pool home from 15 minutes before kickoff through live play. */
export const PRE_KICKOFF_WINDOW_MS = 15 * 60 * 1000

/** Keep scheduled matches visible after kickoff until API marks them live/finished. */
export const POST_KICKOFF_SCHEDULED_MS = 180 * 60 * 1000

export function isPoolLiveSectionMatch(
  status: string,
  kickoffAt: string,
  nowMs = Date.now(),
): boolean {
  if (status === 'live') return true
  if (status === 'cancelled' || status === 'postponed' || status === 'finished') return false

  const kickoff = new Date(kickoffAt).getTime()
  const windowStart = kickoff - PRE_KICKOFF_WINDOW_MS
  const windowEnd = kickoff + POST_KICKOFF_SCHEDULED_MS

  return status === 'scheduled' && nowMs >= windowStart && nowMs < windowEnd
}

export function minutesUntilKickoff(kickoffAt: string, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(kickoffAt).getTime() - nowMs) / 60_000))
}

export function poolLiveSectionQueryBounds(nowMs = Date.now()) {
  const preKickoff = new Date(nowMs + PRE_KICKOFF_WINDOW_MS).toISOString()
  const postKickoffFloor = new Date(nowMs - POST_KICKOFF_SCHEDULED_MS).toISOString()
  return { preKickoff, postKickoffFloor }
}
