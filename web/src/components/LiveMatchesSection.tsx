import { Link } from 'react-router-dom'
import { Radio } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { MatchFixtureCard } from '@/components/MatchFixtureCard'
import { supabase } from '@/lib/supabase'
import { formatStage } from '@/lib/poolBoards'
import {
  isPoolLiveSectionMatch,
  minutesUntilKickoff,
  poolLiveSectionQueryBounds,
} from '@/lib/matchWindows'

type TeamSummary = {
  id: string
  name: string
  fifa_code: string
  group_letter: string | null
  global_fifa_rank: number | null
  api_football_team_id: number | null
}

type LiveMatch = {
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
  events: import('@/components/MatchEventsList').MatchEventRow[]
  venue_name: string | null
  venue_city: string | null
  referee: string | null
  attendance: number | null
}

type Props = {
  assignedTeamId?: string | null
  playerLineForTeam: (teamId: string) => string | undefined
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

function statusLabel(match: LiveMatch) {
  if (match.status === 'live') {
    return { text: `Live · ${formatStage(match.stage)}`, live: true }
  }
  const mins = minutesUntilKickoff(match.kickoff_at)
  if (mins <= 0) {
    return { text: `Kicking off · ${formatStage(match.stage)}`, live: false, soon: true }
  }
  if (mins === 1) {
    return { text: `Kicks off in 1 min · ${formatStage(match.stage)}`, live: false, soon: true }
  }
  return {
    text: `Kicks off in ${mins} mins · ${formatStage(match.stage)}`,
    live: false,
    soon: true,
  }
}

export function LiveMatchesSection({ assignedTeamId, playerLineForTeam }: Props) {
  const liveQuery = useQuery({
    queryKey: ['pool-live-matches'],
    refetchInterval: (query) => {
      const rows = query.state.data
      if (!rows?.length) return 60_000
      const hasUpcoming = rows.some((m) => m.status === 'scheduled')
      return hasUpcoming ? 30_000 : 60_000
    },
    queryFn: async () => {
      const { preKickoff, postKickoffFloor } = poolLiveSectionQueryBounds()

      const [{ data: liveRows, error: liveErr }, { data: upcomingRows, error: upcomingErr }] =
        await Promise.all([
          supabase.from('matches').select('*').eq('status', 'live').order('kickoff_at', {
            ascending: true,
          }),
          supabase
            .from('matches')
            .select('*')
            .eq('status', 'scheduled')
            .lte('kickoff_at', preKickoff)
            .gte('kickoff_at', postKickoffFloor)
            .order('kickoff_at', { ascending: true }),
        ])
      if (liveErr) throw liveErr
      if (upcomingErr) throw upcomingErr

      const byId = new Map<string, (typeof liveRows)[number]>()
      for (const m of liveRows ?? []) byId.set(m.id, m)
      for (const m of upcomingRows ?? []) {
        if (isPoolLiveSectionMatch(m.status, m.kickoff_at)) {
          byId.set(m.id, m)
        }
      }

      const matches = [...byId.values()].sort(
        (a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime(),
      )
      if (matches.length === 0) return [] as LiveMatch[]

      const teamIds = [...new Set(matches.flatMap((m) => [m.home_team_id, m.away_team_id]))]
      const matchIds = matches.map((m) => m.id)

      const [{ data: teams, error: tErr }, { data: events, error: eErr }] = await Promise.all([
        supabase
          .from('teams')
          .select('id, name, fifa_code, group_letter, global_fifa_rank, api_football_team_id')
          .in('id', teamIds),
        supabase
          .from('match_events')
          .select('*')
          .in('match_id', matchIds)
          .order('sort_order', { ascending: true }),
      ])
      if (tErr) throw tErr
      if (eErr) throw eErr

      const teamMap = new Map((teams ?? []).map((t) => [t.id, t as TeamSummary]))
      const eventsByMatch = new Map<string, LiveMatch['events']>()
      for (const ev of events ?? []) {
        const list = eventsByMatch.get(ev.match_id) ?? []
        list.push(ev as LiveMatch['events'][number])
        eventsByMatch.set(ev.match_id, list)
      }

      return matches
        .map((m) => {
          const home = teamMap.get(m.home_team_id)
          const away = teamMap.get(m.away_team_id)
          if (!home || !away) return null
          return {
            ...m,
            home,
            away,
            events: eventsByMatch.get(m.id) ?? [],
          }
        })
        .filter((m): m is LiveMatch => m != null)
    },
  })

  const liveMatches = liveQuery.data ?? []
  if (liveMatches.length === 0) return null

  const liveCount = liveMatches.filter((m) => m.status === 'live').length
  const upcomingCount = liveMatches.length - liveCount
  const sectionTitle =
    liveCount > 0 && upcomingCount > 0
      ? 'Live & upcoming'
      : liveCount > 0
        ? 'Live now'
        : 'Starting soon'
  const sectionDescription =
    liveCount > 0 && upcomingCount > 0
      ? `${liveCount} live, ${upcomingCount} kicking off soon`
      : liveCount > 0
        ? `${liveCount} match${liveCount === 1 ? '' : 'es'} in progress`
        : `${upcomingCount} match${upcomingCount === 1 ? '' : 'es'} kicking off within 15 minutes`

  return (
    <Card className="border-red-400/50 bg-[color-mix(in_srgb,red_6%,var(--card))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`flex h-2 w-2 rounded-full ${
                liveCount > 0 ? 'animate-pulse bg-red-500' : 'bg-amber-500'
              }`}
              aria-hidden
            />
            <CardTitle className="text-xl">{sectionTitle}</CardTitle>
          </div>
          <CardDescription className="mt-1">{sectionDescription}</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="fixtures">
            <Radio className="h-4 w-4" /> All fixtures
          </Link>
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        {liveMatches.map((m) => {
          const involvesAssigned =
            assignedTeamId &&
            (m.home_team_id === assignedTeamId || m.away_team_id === assignedTeamId)
          const showScore = m.home_score != null && m.away_score != null
          const status = statusLabel(m)

          return (
            <div
              key={m.id}
              className={`rounded-xl border bg-[var(--background)] p-4 ${
                involvesAssigned
                  ? 'border-2 border-[var(--team-primary)]'
                  : 'border-[var(--border)]'
              }`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                <time dateTime={m.kickoff_at}>{formatKickoffLocal(m.kickoff_at)}</time>
                <span
                  className={`inline-flex items-center gap-1 font-semibold uppercase ${
                    status.live
                      ? 'text-red-500'
                      : status.soon
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-[var(--muted)]'
                  }`}
                >
                  {status.live && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  )}
                  {status.text}
                </span>
              </div>
              <MatchFixtureCard
                home={m.home}
                away={m.away}
                homeScore={showScore ? m.home_score : undefined}
                awayScore={showScore ? m.away_score : undefined}
                homeHighlight={m.home_team_id === assignedTeamId}
                awayHighlight={m.away_team_id === assignedTeamId}
                homePlayerLine={playerLineForTeam(m.home_team_id)}
                awayPlayerLine={playerLineForTeam(m.away_team_id)}
                showOdds={false}
                matchInfo={{
                  venueName: m.venue_name,
                  venueCity: m.venue_city,
                  referee: m.referee,
                  attendance: m.attendance,
                }}
                events={m.events}
                homeApiId={m.home.api_football_team_id}
                showEvents={m.status === 'live'}
              />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
