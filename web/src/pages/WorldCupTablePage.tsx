import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Filter, Star, TableProperties } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { GroupStandingsGrid } from '@/components/worldCupTable/GroupStandingsGrid'
import { KnockoutBracket } from '@/components/worldCupTable/KnockoutBracket'
import { supabase } from '@/lib/supabase'
import {
  GROUP_LETTERS,
  TBD_TEAM,
  buildKnockoutRounds,
  collectQualifiedTeams,
  computeGroupStandings,
  type KnockoutMatch,
  type TeamInfo,
} from '@/lib/worldCupStandings'
import { useMatchSyncRealtime } from '@/hooks/useMatchSyncRealtime'
import type { PoolOutletContext } from '@/pages/PoolShell'

type ViewMode = 'groups' | 'knockout'

function filterSelectClass() {
  return (
    'h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm ' +
    'text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]'
  )
}

export function WorldCupTablePage() {
  const { assignedTeamId, assignedTeamName } = useOutletContext<PoolOutletContext>()

  const [view, setView] = useState<ViewMode>('groups')
  const [groupFilter, setGroupFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [myTeamOnly, setMyTeamOnly] = useState(false)

  useMatchSyncRealtime()

  const dataQuery = useQuery({
    queryKey: ['world-cup-table'],
    queryFn: async () => {
      const [{ data: teams, error: tErr }, { data: matches, error: mErr }] = await Promise.all([
        supabase
          .from('teams')
          .select('id, name, fifa_code, group_letter')
          .not('group_letter', 'is', null)
          .order('group_letter')
          .order('name'),
        supabase.from('matches').select('*').order('kickoff_at', { ascending: true }),
      ])
      if (tErr) throw tErr
      if (mErr) throw mErr

      const teamRows = (teams ?? []) as TeamInfo[]
      const teamMap = new Map(teamRows.map((t) => [t.id, t]))

      const knockoutMatches: KnockoutMatch[] = []
      for (const m of matches ?? []) {
        if (m.stage === 'group') continue
        const home = teamMap.get(m.home_team_id) ?? TBD_TEAM
        const away = teamMap.get(m.away_team_id) ?? TBD_TEAM
        knockoutMatches.push({
          id: m.id,
          home_team_id: m.home_team_id,
          away_team_id: m.away_team_id,
          home_score: m.home_score,
          away_score: m.away_score,
          status: m.status,
          stage: m.stage,
          kickoff_at: m.kickoff_at,
          winner_team_id: m.winner_team_id,
          api_status_short: m.api_status_short,
          home,
          away,
        })
      }

      return {
        teams: teamRows,
        groupMatches: (matches ?? []).map((m) => ({
          home_team_id: m.home_team_id,
          away_team_id: m.away_team_id,
          home_score: m.home_score,
          away_score: m.away_score,
          status: m.status,
          stage: m.stage,
        })),
        knockoutMatches,
      }
    },
    refetchInterval: (query) => {
      const matches = query.state.data?.knockoutMatches ?? []
      const groupMatches = query.state.data?.groupMatches ?? []
      const hasLive =
        matches.some((m) => m.status === 'live') ||
        groupMatches.some((m) => m.status === 'live')
      return hasLive ? 60_000 : false
    },
  })

  const standingsByGroup = useMemo(
    () => computeGroupStandings(dataQuery.data?.teams ?? [], dataQuery.data?.groupMatches ?? []),
    [dataQuery.data],
  )

  const knockoutRounds = useMemo(() => {
    const qualified = collectQualifiedTeams(standingsByGroup)
    return buildKnockoutRounds(dataQuery.data?.knockoutMatches ?? [], qualified)
  }, [dataQuery.data, standingsByGroup])

  const teamOptions = useMemo(() => {
    return [...(dataQuery.data?.teams ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  }, [dataQuery.data])

  const activeTeamFilter = myTeamOnly && assignedTeamId ? assignedTeamId : teamFilter

  const visibleGroups = useMemo(() => {
    let letters = GROUP_LETTERS.filter((g) => standingsByGroup.has(g))
    if (groupFilter) letters = letters.filter((g) => g === groupFilter)
    if (activeTeamFilter) {
      letters = letters.filter((letter) =>
        (standingsByGroup.get(letter) ?? []).some((row) => row.team.id === activeTeamFilter),
      )
    }
    return letters
  }, [standingsByGroup, groupFilter, activeTeamFilter])

  const hasActiveFilters = myTeamOnly || Boolean(groupFilter || teamFilter)

  function clearFilters() {
    setGroupFilter('')
    setTeamFilter('')
    setMyTeamOnly(false)
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
            World Cup table
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Group standings and knockout bracket
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={view === 'groups' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('groups')}
        >
          <TableProperties className="h-4 w-4" />
          Group stage
        </Button>
        <Button
          type="button"
          variant={view === 'knockout' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('knockout')}
        >
          Knockout
        </Button>
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
            <Label htmlFor="wc-filter-group">Group</Label>
            <select
              id="wc-filter-group"
              className={filterSelectClass()}
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">All groups</option>
              {GROUP_LETTERS.map((g) => (
                <option key={g} value={g}>
                  Group {g}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wc-filter-team">Nation</Label>
            <select
              id="wc-filter-team"
              className={filterSelectClass()}
              value={teamFilter}
              disabled={myTeamOnly}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="">All nations</option>
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
            onClick={() => {
              setMyTeamOnly((v) => !v)
              if (!myTeamOnly) setTeamFilter('')
            }}
          >
            <Star className={`mr-1.5 h-4 w-4 ${myTeamOnly ? 'fill-current' : ''}`} />
            {myTeamOnly ? `Showing ${assignedTeamName ?? 'your team'}` : 'My assigned team'}
          </Button>
        )}
      </Card>

      {dataQuery.isLoading && (
        <p className="text-sm text-[var(--muted)]">Loading World Cup table…</p>
      )}

      {dataQuery.isError && (
        <Card className="border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            Could not load World Cup table.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => dataQuery.refetch()}
          >
            Try again
          </Button>
        </Card>
      )}

      {dataQuery.data && view === 'groups' && (
        <section className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Standings update when group matches finish.{' '}
            <span className="font-medium text-[var(--primary)]">Q</span> marks teams who have
            clinched or earned a top-two finish.
          </p>
          <GroupStandingsGrid
            standingsByGroup={standingsByGroup}
            visibleGroups={visibleGroups}
            highlightTeamId={assignedTeamId}
            filterTeamId={activeTeamFilter || undefined}
          />
        </section>
      )}

      {dataQuery.data && view === 'knockout' && (
        <section className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Winners advance into later rounds as knockout matches finish. Empty slots stay TBD
            until the previous round is complete or fixtures sync from the API.
          </p>
          <KnockoutBracket
            rounds={knockoutRounds}
            highlightTeamId={assignedTeamId}
            filterTeamId={activeTeamFilter || undefined}
          />
        </section>
      )}

    </div>
  )
}
