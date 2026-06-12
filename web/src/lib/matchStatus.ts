import { formatStage } from '@/lib/poolBoards'

export type MatchClock = {
  status: string
  apiStatusShort?: string | null
  elapsedMinutes?: number | null
  extraMinutes?: number | null
  statusSyncedAt?: string | null
  stage?: string
}

/** Internal anchor for smooth client ticking between API syncs. */
export type MatchClockAnchor = {
  baseSeconds: number
  syncedAtMs: number
  elapsedMinutes: number
  extraMinutes: number
  apiStatusShort: string
  inStoppage: boolean
}

const TICKING_PERIODS = new Set(['1H', '2H', 'ET', 'LIVE', 'INT'])

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function isStoppage(clock: MatchClock): boolean {
  return (clock.extraMinutes ?? 0) > 0 && clock.elapsedMinutes != null
}

/** Total seconds at the API sync moment (regulation + stoppage minutes, :00). */
export function apiSyncBaseSeconds(clock: MatchClock): number | null {
  if (clock.elapsedMinutes == null) return null
  if (isStoppage(clock)) {
    return clock.elapsedMinutes * 60 + (clock.extraMinutes ?? 0) * 60
  }
  return clock.elapsedMinutes * 60
}

/**
 * Merge a new API clock reading into a running anchor without snapping backward.
 * API elapsed is minute-only, so we preserve sub-minute progress within the same minute.
 */
export function mergeMatchClockAnchor(
  clock: MatchClock,
  prev: MatchClockAnchor | null,
  nowMs = Date.now(),
): MatchClockAnchor | null {
  if (clock.status !== 'live') return null

  const short = clock.apiStatusShort?.toUpperCase() ?? ''
  if (!TICKING_PERIODS.has(short)) return null
  if (clock.elapsedMinutes == null || !clock.statusSyncedAt) return null

  const syncedAtMs = new Date(clock.statusSyncedAt).getTime()
  const apiBase = apiSyncBaseSeconds(clock)
  if (apiBase == null) return null

  const inStoppage = isStoppage(clock)
  const extra = clock.extraMinutes ?? 0

  if (!prev || syncedAtMs > prev.syncedAtMs) {
    let baseSeconds = apiBase

    if (prev && syncedAtMs > prev.syncedAtMs) {
      const interpolated =
        prev.baseSeconds + Math.max(0, Math.floor((nowMs - prev.syncedAtMs) / 1000))

      const apiMinuteAdvanced =
        clock.elapsedMinutes > prev.elapsedMinutes ||
        (inStoppage && extra > prev.extraMinutes)

      if (apiMinuteAdvanced) {
        // Trust the new API minute; keep sub-minute offset when reasonable.
        const subMinute = Math.min(59, Math.max(0, interpolated - apiBase))
        baseSeconds = apiBase + subMinute
      } else if (
        clock.elapsedMinutes === prev.elapsedMinutes &&
        extra === prev.extraMinutes &&
        short === prev.apiStatusShort
      ) {
        // Same API minute — never snap backward; cap at +59s within minute.
        baseSeconds = Math.max(apiBase, interpolated)
        baseSeconds = Math.min(baseSeconds, apiBase + 59)
      } else {
        // Stale API reading — keep interpolating forward.
        baseSeconds = Math.max(interpolated, apiBase)
      }
    }

    return {
      baseSeconds,
      syncedAtMs,
      elapsedMinutes: clock.elapsedMinutes,
      extraMinutes: extra,
      apiStatusShort: short,
      inStoppage,
    }
  }

  return prev
}

export function getElapsedSecondsFromAnchor(
  anchor: MatchClockAnchor,
  nowMs = Date.now(),
): number {
  return anchor.baseSeconds + Math.max(0, Math.floor((nowMs - anchor.syncedAtMs) / 1000))
}

/** Live clock with seconds; uses anchor for smooth ticking between API syncs. */
export function formatLiveElapsedFromAnchor(
  anchor: MatchClockAnchor,
  nowMs = Date.now(),
): string {
  const totalSeconds = getElapsedSecondsFromAnchor(anchor, nowMs)

  if (anchor.inStoppage) {
    const regulationSeconds = anchor.elapsedMinutes * 60
    const stoppageSeconds = Math.max(0, totalSeconds - regulationSeconds)
    const stoppageMin = Math.floor(stoppageSeconds / 60)
    const stoppageSec = stoppageSeconds % 60
    return `${anchor.elapsedMinutes}+${stoppageMin}:${pad2(stoppageSec)}`
  }

  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}:${pad2(secs)}`
}

/** @deprecated Prefer anchor-based formatting in MatchElapsedClock. */
export function formatLiveElapsed(clock: MatchClock, nowMs = Date.now()): string | null {
  if (clock.status !== 'live') return null

  const short = clock.apiStatusShort?.toUpperCase() ?? ''
  if (short === 'HT') return 'Half time'
  if (short === 'BT') return 'Break'
  if (short === 'P') return 'Penalties'

  const anchor = mergeMatchClockAnchor(clock, null, nowMs)
  if (!anchor) return 'Live'

  return formatLiveElapsedFromAnchor(anchor, nowMs)
}

/** @deprecated Use formatLiveElapsedFromAnchor */
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
