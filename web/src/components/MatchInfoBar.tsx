import { MapPin, UserRound, Users } from 'lucide-react'

export type MatchInfo = {
  venueName?: string | null
  venueCity?: string | null
  referee?: string | null
  attendance?: number | null
}

export function MatchInfoBar({ info }: { info: MatchInfo }) {
  const venue = [info.venueName, info.venueCity].filter(Boolean).join(', ')
  const hasAny = Boolean(venue || info.referee || info.attendance != null)
  if (!hasAny) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)]">
      {venue && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]/70" aria-hidden />
          <span className="truncate">{venue}</span>
        </span>
      )}
      {info.attendance != null && (
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]/70" aria-hidden />
          <span>{info.attendance.toLocaleString()} attendance</span>
        </span>
      )}
      {info.referee && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]/70" aria-hidden />
          <span className="truncate">{info.referee}</span>
        </span>
      )}
    </div>
  )
}
