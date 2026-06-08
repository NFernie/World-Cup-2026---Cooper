import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { MatchOddsGrid } from '@/components/MatchOddsGrid'
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
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <MatchTeamCompact
          team={home}
          align="left"
          highlight={homeHighlight}
          score={homeScore}
        />
        {homeScore == null && awayScore == null && (
          <span className="shrink-0 px-1 text-sm font-medium text-[var(--muted)]">vs</span>
        )}
        <MatchTeamCompact
          team={away}
          align="right"
          highlight={awayHighlight}
          score={awayScore}
        />
      </div>

      {showOdds && odds && <MatchOddsGrid odds={odds} />}

      <div className={showOdds && odds ? '' : 'mt-1'}>
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
