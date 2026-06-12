import { formatStage } from '@/lib/poolBoards'

export type MatchClock = {
  status: string
  apiStatusShort?: string | null
  elapsedMinutes?: number | null
  extraMinutes?: number | null
  statusSyncedAt?: string | null
  stage?: string
}

const TICKING_PERIODS = new Set(['1H', '2H', 'ET', 'LIVE', 'INT'])

/** Elapsed display for live matches; interpolates between API syncs. */
export function formatLiveElapsedMinutes(
  clock: MatchClock,
  nowMs = Date.now(),
): string | null {
  if (clock.status !== 'live') return null

  const short = clock.apiStatusShort?.toUpperCase() ?? ''
  if (short === 'HT') return 'Half time'
  if (short === 'BT') return 'Break'
  if (short === 'P') return 'Penalties'

  let elapsed = clock.elapsedMinutes
  if (
    elapsed != null &&
    TICKING_PERIODS.has(short) &&
    clock.statusSyncedAt
  ) {
    const minsSinceSync = Math.floor(
      (nowMs - new Date(clock.statusSyncedAt).getTime()) / 60_000,
    )
    if (minsSinceSync > 0) elapsed += minsSinceSync
  }

  if (elapsed == null) return 'Live'

  const extra = clock.extraMinutes
  if (extra != null && extra > 0) return `${elapsed}+${extra}'`
  return `${elapsed}'`
}

export function formatMatchStatusLabel(clock: MatchClock, nowMs = Date.now()): string {
  const stage = clock.stage ? formatStage(clock.stage) : ''

  if (clock.status === 'live') {
    const elapsed = formatLiveElapsedMinutes(clock, nowMs)
    return elapsed ? `${elapsed} · ${stage}` : `Live · ${stage}`
  }

  return `${clock.status.replace(/_/g, ' ')}${stage ? ` · ${stage}` : ''}`
}
