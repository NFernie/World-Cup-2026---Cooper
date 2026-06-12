import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { MatchOddsGrid } from '@/components/MatchOddsGrid'
import { MatchEventsDropdown, type MatchEventRow } from '@/components/MatchEventsList'
import { MatchInfoBar, type MatchInfo } from '@/components/MatchInfoBar'
import { MatchElapsedClock } from '@/components/MatchElapsedClock'
import type { MatchClock } from '@/lib/matchStatus'
import {
  MatchTeamCompact,
  MatchTeamDetails,
  type MatchTeamSideTeam,
} from '@/components/MatchTeamSide'

type FixtureOdds = {
  home_win_decimal: number
  draw_decimal: number
  away_win_decimal: number
}

export function MatchFixtureCard({
  home,
  away,
  homeScore,
  awayScore,
  homeHighlight,
  awayHighlight,
  homePlayerLine,
  awayPlayerLine,
  odds,
  showOdds = true,
  matchInfo,
  events,
  homeApiId,
  showEvents = false,
  clock,
}: {
  home: MatchTeamSideTeam
  away: MatchTeamSideTeam
  homeScore?: number | null
  awayScore?: number | null
  homeHighlight?: boolean
  awayHighlight?: boolean
  homePlayerLine?: string
  awayPlayerLine?: string
  odds?: FixtureOdds | null
  /** When true, render odds grid whenever odds exist (default). */
  showOdds?: boolean
  matchInfo?: MatchInfo
  events?: MatchEventRow[]
  homeApiId?: number | null
  /** When true, render Match Events dropdown when events exist. */
  showEvents?: boolean
  clock?: MatchClock
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const showScore = homeScore != null && awayScore != null
  const hasEvents = showEvents && events && events.length > 0

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 sm:gap-3">
        <MatchTeamCompact team={home} align="left" highlight={homeHighlight} />
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1 text-center">
          {clock && <MatchElapsedClock clock={clock} />}
          {showScore ? (
            <span className="text-2xl font-bold tabular-nums tracking-tight text-[var(--foreground)]">
              {homeScore} - {awayScore}
            </span>
          ) : (
            <span className="text-sm font-medium text-[var(--muted)]">vs</span>
          )}
        </div>
        <MatchTeamCompact team={away} align="right" highlight={awayHighlight} />
      </div>

      {showOdds && odds && <MatchOddsGrid odds={odds} />}

      {matchInfo && <MatchInfoBar info={matchInfo} />}

      {hasEvents && (
        <MatchEventsDropdown
          events={events}
          homeApiId={homeApiId ?? null}
          home={home}
          away={away}
        />
      )}

      <div>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--card)] hover:text-[var(--foreground)]"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          Additional info
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {detailsOpen && (
          <div className="mt-2 grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 sm:grid-cols-2">
            <MatchTeamDetails team={home} playerLine={homePlayerLine} align="left" />
            <MatchTeamDetails team={away} playerLine={awayPlayerLine} align="right" />
          </div>
        )}
      </div>
    </div>
  )
}
