import { useEffect, useState } from 'react'
import { formatLiveElapsed, type MatchClock } from '@/lib/matchStatus'

/** Live elapsed time centred above the score (text-lg — two steps below score text-2xl). */
export function MatchElapsedClock({ clock }: { clock: MatchClock }) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (clock.status !== 'live') return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [clock.status, clock.statusSyncedAt, clock.elapsedMinutes])

  if (clock.status !== 'live') return null

  const elapsed = formatLiveElapsed(clock, nowMs)
  if (!elapsed) return null

  return (
    <p
      className="text-lg font-bold tabular-nums leading-none tracking-tight text-red-500"
      aria-live="off"
    >
      {elapsed}
    </p>
  )
}
