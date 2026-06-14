import { useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Filter, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { MatchFixtureCard } from '@/components/MatchFixtureCard'
import { MatchStatusBadge } from '@/components/MatchStatusBadge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useMatchSyncRealtime } from '@/hooks/useMatchSyncRealtime'
import {
  formatPlayerLine,
  isRevealNamesEnabled,
  maskMemberName,
} from '@/lib/poolNames'
import {
  STAGE_FILTER_OPTIONS,
  formatDateFilterLabel,
  kickoffDateKey,
} from '@/lib/poolBoards'
import type { PoolOutletContext } from '@/pages/PoolShell'

type TeamRow = {
  id: string
  name: string
  fifa_code: string
  group_letter: string | null
  api_football_team_id: number | null
  global_fifa_rank: number | null
}

type MatchEventRow = {
  id: string
  match_id: string
  minute: number
  extra_minute: number | null
  player_name: string
  assist_name: string | null
  event_type: string
  detail: string | null
  team_api_id: number | null
  sort_order: number
}

type FixtureRow = {
  id: string
  home_team_id: string
  away_team_id: string
  kickoff_at: string
  home_score: number | null
  away_score: number | null
  status: string
  stage: string
  venue_name: string | null
  venue_city: string | null
  referee: string | null
  attendance: number | null
  api_status_short: string | null
  elapsed_minutes: number | null
  extra_minutes: number | null
  status_synced_at: string | null
  home: TeamRow
  away: TeamRow
  odds: {
    home_win_decimal: number
    draw_decimal: number
    away_win_decimal: number
  } | null
  events: MatchEventRow[]
}

type PoolMemberSummary = {
  id: string
  user_id: string
  display_name: string
  assigned_team_id: string
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

function filterSelectClass() {
  return (
    'h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm ' +
    'text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]'
  )
}

export function FixturesPage() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useAuth()
  const { assignedTeamId, assignedTeamName } = useOutletContext<PoolOutletContext>()

  const [dateFilter, setDateFilter] = useState('')
  const [roundFilter, setRoundFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [myTeamOnly, setMyTeamOnly] = useState(false)
  const [hideFinished, setHideFinished] = useState(false)

  useMatchSyncRealtime()

  const fixturesQuery = useQuery({
    queryKey: ['fixtures-full'],
    queryFn: async () => {
      const [
        { data: matches, error: mErr },
        { data: teams, error: tErr },
        { data: odds, error: oErr },
      ] = await Promise.all([
        supabase.from('matches').select('*').order('kickoff_at', { ascending: true }),
        supabase
          .from('teams')
          .select('id, name, fifa_code, group_letter, api_football_team_id, global_fifa_rank'),
        supabase.from('match_odds').select('*'),
      ])
      if (mErr) throw mErr
      if (tErr) throw tErr
      if (oErr) throw oErr

      // Goal scorers table may not exist until migration 20260609000009 is applied.
      const { data: events, error: eErr } = await supabase
        .from('match_events')
        .select('*')
        .order('sort_order', { ascending: true })
      const eventsOk = !eErr

      const teamMap = new Map((teams ?? []).map((t) => [t.id, t as TeamRow]))
      const oddsMap = new Map((odds ?? []).map((o) => [o.match_id, o]))
      const eventsByMatch = new Map<string, MatchEventRow[]>()
      if (eventsOk) {
        for (const ev of events ?? []) {
          const list = eventsByMatch.get(ev.match_id) ?? []
          list.push(ev as MatchEventRow)
          eventsByMatch.set(ev.match_id, list)
        }
      }

      return (matches ?? [])
        .map((m) => {
          const home = teamMap.get(m.home_team_id)
          const away = teamMap.get(m.away_team_id)
          if (!home || !away) return null
          return {
            ...m,
            home,
            away,
            odds: oddsMap.get(m.id) ?? null,
            events: eventsByMatch.get(m.id) ?? [],
          }
        })
        .filter((m): m is FixtureRow => m != null)
    },
    refetchInterval: (query) => {
      const rows = query.state.data
      if (rows?.some((m) => m.status === 'live')) return 30_000
      return false
    },
  })

  const poolQuery = useQuery({
    queryKey: ['pool', poolId],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await supabase.from('pools').select('*').eq('id', poolId!).single()
      if (error) throw error
      return data
    },
  })

  const memberQuery = useQuery({
    queryKey: ['pool-member', poolId, user?.id],
    enabled: Boolean(poolId && user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_members')
        .select('*')
        .eq('pool_id', poolId!)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const poolMembersQuery = useQuery({
    queryKey: ['pool-members-summary', poolId],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_members')
        .select('id, user_id, display_name, assigned_team_id')
        .eq('pool_id', poolId!)
        .order('join_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as PoolMemberSummary[]
    },
  })

  const allFixtures = fixturesQuery.data ?? []
  const pool = poolQuery.data
  const nameVisibility = {
    revealNames: isRevealNamesEnabled(pool?.reveal_names),
    hostUserId: pool?.host_user_id ?? '',
    viewerUserId: user?.id,
  }

  const playerLineForTeam = (teamId: string) => {
    const players = (poolMembersQuery.data ?? []).filter((m) => m.assigned_team_id === teamId)
    if (players.length === 0) return undefined
    return formatPlayerLine(
      players.map((m) => maskMemberName(m.display_name, nameVisibility, m.user_id)),
      players.map((m) => m.id),
      players.length,
      nameVisibility,
      memberQuery.data?.id,
    )
  }

  const dateOptions = useMemo(() => {
    const keys = [...new Set(allFixtures.map((m) => kickoffDateKey(m.kickoff_at)))].sort()
    return keys
  }, [allFixtures])

  const teamOptions = useMemo(() => {
    const seen = new Map<string, TeamRow>()
    for (const m of allFixtures) {
      seen.set(m.home.id, m.home)
      seen.set(m.away.id, m.away)
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [allFixtures])

  const groupOptions = useMemo(() => {
    const letters = new Set<string>()
    for (const t of teamOptions) {
      if (t.group_letter) letters.add(t.group_letter)
    }
    return [...letters].sort()
  }, [teamOptions])

  const filtered = useMemo(() => {
    return allFixtures.filter((m) => {
      if (myTeamOnly && assignedTeamId) {
        if (m.home_team_id !== assignedTeamId && m.away_team_id !== assignedTeamId) return false
      }
      if (dateFilter && kickoffDateKey(m.kickoff_at) !== dateFilter) return false
      if (roundFilter && m.stage !== roundFilter) return false
      if (groupFilter) {
        if (m.stage !== 'group') return false
        if (m.home.group_letter !== groupFilter && m.away.group_letter !== groupFilter) return false
      }
      if (teamFilter && m.home_team_id !== teamFilter && m.away_team_id !== teamFilter) return false
      if (hideFinished && m.status === 'finished') return false
      return true
    })
  }, [allFixtures, myTeamOnly, assignedTeamId, dateFilter, roundFilter, groupFilter, teamFilter, hideFinished])

  const hasActiveFilters =
    myTeamOnly || hideFinished || Boolean(dateFilter || roundFilter || groupFilter || teamFilter)

  function clearFilters() {
    setDateFilter('')
    setRoundFilter('')
    setGroupFilter('')
    setTeamFilter('')
    setMyTeamOnly(false)
    setHideFinished(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to="..">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            Fixtures & results
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {filtered.length} of {allFixtures.length} matches
          </p>
        </div>
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <Filter className="h-4 w-4 text-[var(--muted)]" aria-hidden />
            Filters
          </div>
          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="filter-date">Date</Label>
            <select
              id="filter-date"
              className={filterSelectClass()}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="">All dates</option>
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {formatDateFilterLabel(d)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-round">Round</Label>
            <select
              id="filter-round"
              className={filterSelectClass()}
              value={roundFilter}
              onChange={(e) => setRoundFilter(e.target.value)}
            >
              {STAGE_FILTER_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-group">Group</Label>
            <select
              id="filter-group"
              className={filterSelectClass()}
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">All groups</option>
              {groupOptions.map((g) => (
                <option key={g} value={g}>
                  Group {g}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-team">Team</Label>
            <select
              id="filter-team"
              className={filterSelectClass()}
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="">All teams</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {assignedTeamId && (
          <Button
            type="button"
            variant={myTeamOnly ? 'default' : 'outline'}
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => setMyTeamOnly((v) => !v)}
          >
            <Star className={`mr-1.5 h-4 w-4 ${myTeamOnly ? 'fill-current' : ''}`} />
            {myTeamOnly ? `Showing ${assignedTeamName ?? 'your team'} only` : 'My team fixtures'}
          </Button>
        )}

        <Button
          type="button"
          variant={hideFinished ? 'default' : 'outline'}
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => setHideFinished((v) => !v)}
        >
          {hideFinished ? 'Showing upcoming & live only' : 'Hide finished matches'}
        </Button>
      </Card>

      <div className="space-y-3">
        {fixturesQuery.isLoading && (
          <p className="text-sm text-[var(--muted)]">Loading fixtures…</p>
        )}

        {fixturesQuery.isError && (
          <Card className="border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Could not load fixtures.
            </p>
            <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">
              {(fixturesQuery.error as Error)?.message ?? 'Unknown error'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => fixturesQuery.refetch()}
            >
              Try again
            </Button>
          </Card>
        )}

        {filtered.map((m) => {
          if (!m.home || !m.away) return null
          const involvesAssigned =
            assignedTeamId &&
            (m.home_team_id === assignedTeamId || m.away_team_id === assignedTeamId)
          const showScore = m.home_score != null && m.away_score != null
          const showEvents = m.status === 'live' || m.status === 'finished'

          return (
            <Card
              key={m.id}
              className={
                involvesAssigned
                  ? 'border-2 border-[var(--team-primary)] bg-[var(--team-primary)]/8 p-4'
                  : 'p-4'
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                <time dateTime={m.kickoff_at}>{formatKickoffLocal(m.kickoff_at)}</time>
                <MatchStatusBadge
                  clock={{
                    status: m.status,
                    apiStatusShort: m.api_status_short,
                    elapsedMinutes: m.elapsed_minutes,
                    extraMinutes: m.extra_minutes,
                    statusSyncedAt: m.status_synced_at,
                    stage: m.stage,
                  }}
                />
              </div>

              <div className="mt-4">
                <MatchFixtureCard
                  home={m.home}
                  away={m.away}
                  homeScore={showScore ? m.home_score : undefined}
                  awayScore={showScore ? m.away_score : undefined}
                  homeHighlight={m.home_team_id === assignedTeamId}
                  awayHighlight={m.away_team_id === assignedTeamId}
                  homePlayerLine={playerLineForTeam(m.home_team_id)}
                  awayPlayerLine={playerLineForTeam(m.away_team_id)}
                  odds={m.odds}
                  matchInfo={{
                    venueName: m.venue_name,
                    venueCity: m.venue_city,
                    referee: m.referee,
                    attendance: m.attendance,
                  }}
                  events={m.events}
                  homeApiId={m.home.api_football_team_id}
                  showEvents={showEvents}
                  clock={{
                    status: m.status,
                    apiStatusShort: m.api_status_short,
                    elapsedMinutes: m.elapsed_minutes,
                    extraMinutes: m.extra_minutes,
                    statusSyncedAt: m.status_synced_at,
                    stage: m.stage,
                  }}
                />
              </div>
            </Card>
          )
        })}

        {!fixturesQuery.isLoading && filtered.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-sm text-[var(--muted)]">
              {allFixtures.length === 0
                ? 'No fixtures yet — run sync-fixtures after the API limit resets.'
                : 'No fixtures match your filters.'}
            </p>
            {hasActiveFilters && allFixtures.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
