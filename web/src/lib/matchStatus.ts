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

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** Seconds elapsed in play, anchored to the last API sync. */
export function getLiveElapsedSeconds(clock: MatchClock, nowMs = Date.now()): number | null {
  if (clock.status !== 'live') return null

  const short = clock.apiStatusShort?.toUpperCase() ?? ''
  if (!TICKING_PERIODS.has(short)) return null
  if (clock.elapsedMinutes == null || !clock.statusSyncedAt) return null

  const syncedAt = new Date(clock.statusSyncedAt).getTime()
  const baseSeconds = clock.elapsedMinutes * 60
  const deltaSeconds = Math.max(0, Math.floor((nowMs - syncedAt) / 1000))
  return baseSeconds + deltaSeconds
}

/** Live clock with seconds; ticks smoothly between API syncs. */
export function formatLiveElapsed(clock: MatchClock, nowMs = Date.now()): string | null {
  if (clock.status !== 'live') return null

  const short = clock.apiStatusShort?.toUpperCase() ?? ''
  if (short === 'HT') return 'Half time'
  if (short === 'BT') return 'Break'
  if (short === 'P') return 'Penalties'

  const totalSeconds = getLiveElapsedSeconds(clock, nowMs)
  if (totalSeconds == null) return 'Live'

  const extra = clock.extraMinutes
  const elapsed = clock.elapsedMinutes
  if (extra != null && extra > 0 && elapsed != null && clock.statusSyncedAt) {
    const syncedAt = new Date(clock.statusSyncedAt).getTime()
    const deltaSeconds = Math.max(0, Math.floor((nowMs - syncedAt) / 1000))
    const stoppageMins = extra + Math.floor(deltaSeconds / 60)
    const stoppageSecs = deltaSeconds % 60
    return `${elapsed}+${stoppageMins}:${pad2(stoppageSecs)}`
  }

  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}:${pad2(secs)}`
}

/** @deprecated Use formatLiveElapsed */
export function formatLiveElapsedMinutes(clock: MatchClock, nowMs = Date.now()): string | null {
  return formatLiveElapsed(clock, nowMs)
}

export function formatMatchStatusLabel(clock: MatchClock, nowMs = Date.now()): string {
  const stage = clock.stage ? formatStage(clock.stage) : ''

  if (clock.status === 'live') {
    const elapsed = formatLiveElapsed(clock, nowMs)
    return elapsed ? `${elapsed} · ${stage}` : `Live · ${stage}`
  }

  return `${clock.status.replace(/_/g, ' ')}${stage ? ` · ${stage}` : ''}`
}
