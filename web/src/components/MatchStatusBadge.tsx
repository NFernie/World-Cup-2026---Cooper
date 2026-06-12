import { formatStage } from '@/lib/poolBoards'
import type { MatchClock } from '@/lib/matchStatus'

/** Compact status in the fixture card header (elapsed clock lives above the score). */
export function MatchStatusBadge({ clock }: { clock: MatchClock }) {
  const isLive = clock.status === 'live'
  const stageLabel = clock.stage ? formatStage(clock.stage) : null

  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-red-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
        Live
        {stageLabel && (
          <span className="font-normal text-[var(--muted)]">· {stageLabel}</span>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs uppercase text-[var(--muted)]">
      {stageLabel && <span>{stageLabel}</span>}
      <span className="font-medium">{clock.status.replace(/_/g, ' ')}</span>
    </span>
  )
}
