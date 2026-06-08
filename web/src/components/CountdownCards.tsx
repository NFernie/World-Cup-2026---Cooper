import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { MatchOddsGrid } from '@/components/MatchOddsGrid'
import { TeamFlag } from '@/components/TeamFlag'
import { formatStage } from '@/lib/poolBoards'

type TeamSummary = {
  id: string
  name: string
  fifa_code: string
  group_letter: string | null
}

export type CountdownMatch = {
  id: string
  home_team_id: string
  away_team_id: string
  kickoff_at: string
  home_score: number | null
  away_score: number | null
  status: string
  stage: string
  home: TeamSummary
  away: TeamSummary
  homeManagerLine?: string
  awayManagerLine?: string
  odds?: {
    home_win_decimal: number
    draw_decimal: number
    away_win_decimal: number
  } | null
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}

function formatCountdown(targetIso: string, now: number) {
  const remaining = Math.max(0, new Date(targetIso).getTime() - now)
  const totalSeconds = Math.floor(remaining / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds, remaining }
}

function formatKickoffLocal(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function CountdownDigits({ targetIso, compact = false }: { targetIso: string; compact?: boolean }) {
  const now = useNow()
  const { days, hours, minutes, seconds } = formatCountdown(targetIso, now)
  const items = [
    ['Days', days],
    ['Hours', hours],
    ['Mins', minutes],
    ['Secs', seconds],
  ] as const

  return (
    <div className={`grid grid-cols-4 gap-2 ${compact ? 'max-w-md' : 'mx-auto max-w-xl'}`}>
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-2 py-3 text-center">
          <p className={`${compact ? 'text-2xl' : 'text-4xl'} font-black tabular-nums text-[var(--primary)]`}>
            {String(value).padStart(2, '0')}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {label}
          </p>
        </div>
      ))}
    </div>
  )
}

function FixtureTeamLine({
  team,
  align,
  highlight,
  managerLine,
}: {
  team: TeamSummary
  align: 'left' | 'right'
  highlight?: boolean
  managerLine?: string
}) {
  return (
    <div
      className={`flex flex-1 items-center gap-2 min-w-0 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <TeamFlag fifaCode={team.fifa_code} size={40} title={team.name} />
      <div className="min-w-0">
        <p
          className={`truncate font-semibold leading-tight ${
            highlight ? 'text-[var(--team-primary)]' : 'text-[var(--foreground)]'
          }`}
        >
          {team.name}
        </p>
        {team.group_letter && (
          <p className="text-xs text-[var(--muted)]">Group {team.group_letter}</p>
        )}
        {managerLine && (
          <p className="mt-0.5 text-xs text-[var(--muted)]">{managerLine}</p>
        )}
      </div>
    </div>
  )
}

export function WorldCupCountdown({ firstKickoffAt }: { firstKickoffAt: string | undefined }) {
  const now = useNow()
  if (!firstKickoffAt || new Date(firstKickoffAt).getTime() <= now) return null

  return (
    <Card className="border-[var(--primary)]/50 bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))] p-6 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/15">
        <CalendarClock className="h-7 w-7 text-[var(--primary)]" aria-hidden />
      </div>
      <CardTitle className="text-2xl">World Cup kicks off in</CardTitle>
      <CardDescription className="mt-1">Countdown to the first official kickoff.</CardDescription>
      <div className="mt-5">
        <CountdownDigits targetIso={firstKickoffAt} />
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">First kickoff: {formatKickoffLocal(firstKickoffAt)}</p>
    </Card>
  )
}

export function NextTeamMatchCountdown({
  match,
  assignedTeamId,
}: {
  match: CountdownMatch | null | undefined
  assignedTeamId: string | undefined
}) {
  if (!match || !assignedTeamId) return null

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-xl">Your next match</CardTitle>
          <CardDescription className="mt-1">
            {formatStage(match.stage)} · {formatKickoffLocal(match.kickoff_at)}
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="fixtures">View fixtures</Link>
        </Button>
      </div>

      <div className="mt-4">
        <CountdownDigits targetIso={match.kickoff_at} compact />
      </div>

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
        <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-[var(--muted)]">
          <span>{formatStage(match.stage)}</span>
          <span>{match.status}</span>
        </div>
        <div className="flex items-center gap-3">
          <FixtureTeamLine
            team={match.home}
            align="left"
            highlight={match.home_team_id === assignedTeamId}
            managerLine={match.homeManagerLine}
          />
          <div className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-sm font-bold text-[var(--muted)]">
            vs
          </div>
          <FixtureTeamLine
            team={match.away}
            align="right"
            highlight={match.away_team_id === assignedTeamId}
            managerLine={match.awayManagerLine}
          />
        </div>
        {match.odds && match.status === 'scheduled' && <MatchOddsGrid odds={match.odds} />}
      </div>
    </Card>
  )
}
