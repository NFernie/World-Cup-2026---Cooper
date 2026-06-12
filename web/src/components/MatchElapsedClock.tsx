import { useEffect, useState } from 'react'
import { formatLiveElapsedMinutes, type MatchClock } from '@/lib/matchStatus'

/** Live elapsed time centred above the score (same max size as score: text-2xl). */
export function MatchElapsedClock({ clock }: { clock: MatchClock }) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (clock.status !== 'live') return
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [clock.status])

  if (clock.status !== 'live') return null

  const elapsed = formatLiveElapsedMinutes(clock, nowMs)
  if (!elapsed) return null

  return (
    <p
      className="text-2xl font-bold tabular-nums leading-none tracking-tight text-red-500"
      aria-live="polite"
    >
      {elapsed}
    </p>
  )
}
