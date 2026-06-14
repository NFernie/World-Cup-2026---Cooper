import { useEffect, useRef, useState } from 'react'
import {
  formatLiveElapsedFromAnchor,
  mergeMatchClockAnchor,
  type MatchClock,
  type MatchClockAnchor,
} from '@/lib/matchStatus'

/** Live elapsed time centred above the score (text-lg — two steps below score text-2xl). */
export function MatchElapsedClock({ clock }: { clock: MatchClock }) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const anchorRef = useRef<MatchClockAnchor | null>(null)

  useEffect(() => {
    if (clock.status !== 'live') return
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [
    clock.status,
    clock.statusSyncedAt,
    clock.elapsedMinutes,
    clock.extraMinutes,
    clock.apiStatusShort,
  ])

  anchorRef.current = mergeMatchClockAnchor(clock, anchorRef.current, nowMs)

  if (clock.status !== 'live') return null

  const short = clock.apiStatusShort?.toUpperCase() ?? ''
  if (short === 'HT') {
    return (
      <p className="text-lg font-bold leading-none tracking-tight text-red-500">Half time</p>
    )
  }
  if (short === 'BT') {
    return (
      <p className="text-lg font-bold leading-none tracking-tight text-red-500">Break</p>
    )
  }
  if (short === 'P') {
    return (
      <p className="text-lg font-bold leading-none tracking-tight text-red-500">Penalties</p>
    )
  }

  const anchor = anchorRef.current
  if (!anchor) return null

  return (
    <p
      className="text-lg font-bold tabular-nums leading-none tracking-tight text-red-500"
      aria-live="off"
    >
      {formatLiveElapsedFromAnchor(anchor, nowMs)}
    </p>
  )
}
