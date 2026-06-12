import { useEffect, useState } from 'react'
import { formatStage } from '@/lib/poolBoards'
import { formatLiveElapsedMinutes, type MatchClock } from '@/lib/matchStatus'

export function MatchStatusBadge({ clock }: { clock: MatchClock }) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (clock.status !== 'live') return
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [clock.status])

  const isLive = clock.status === 'live'
  const stageLabel = clock.stage ? formatStage(clock.stage) : null

  if (isLive) {
    const elapsed = formatLiveElapsedMinutes(clock, nowMs) ?? 'Live'
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-red-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
        <span className="uppercase tabular-nums">{elapsed}</span>
        {stageLabel && (
          <span className="font-normal uppercase text-[var(--muted)]">· {stageLabel}</span>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 uppercase text-[var(--muted)]">
      {stageLabel && <span>{stageLabel}</span>}
      <span className="font-medium">{clock.status.replace(/_/g, ' ')}</span>
    </span>
  )
}
