import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { formatPoints } from '@/lib/utils'
import { formatStage } from '@/lib/poolBoards'
import type { PoolOutletContext } from '@/pages/PoolShell'

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

export function FixturesPage() {
  const { poolId } = useParams<{ poolId: string }>()
  const { assignedTeamId } = useOutletContext<PoolOutletContext>()

  const matchesQuery = useQuery({
    queryKey: ['fixtures'],
    queryFn: async () => {
      const [{ data: matches, error: mErr }, { data: teams, error: tErr }, { data: odds, error: oErr }] =
        await Promise.all([
          supabase.from('matches').select('*').order('kickoff_at', { ascending: true }),
          supabase.from('teams').select('id, name, fifa_code'),
          supabase.from('match_odds').select('*'),
        ])
      if (mErr) throw mErr
      if (tErr) throw tErr
      if (oErr) throw oErr
      const teamMap = new Map((teams ?? []).map((t) => [t.id, t]))
      const oddsMap = new Map((odds ?? []).map((o) => [o.match_id, o]))
      return (matches ?? []).map((m) => ({
        ...m,
        home: teamMap.get(m.home_team_id)!,
        away: teamMap.get(m.away_team_id)!,
        odds: oddsMap.get(m.id) ?? null,
      }))
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to={`/pools/${poolId}`}>
            <ArrowLeft className="h-4 w-4" /> Pool
          </Link>
        </Button>
        <h1 className="text-xl font-bold">Fixtures & results</h1>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Kick-off times in your local timezone (synced from API-Football). Your assigned nation is
        highlighted. Odds appear when the API publishes them (typically days before kickoff).
      </p>

      <div className="space-y-3">
        {matchesQuery.data?.map((m) => {
          const involvesAssigned =
            assignedTeamId &&
            (m.home_team_id === assignedTeamId || m.away_team_id === assignedTeamId)
          const score =
            m.home_score != null && m.away_score != null
              ? `${m.home_score} – ${m.away_score}`
              : 'vs'

          return (
            <Card
              key={m.id}
              className={
                involvesAssigned
                  ? 'border-2 border-[var(--team-primary)] bg-[var(--team-primary)]/10'
                  : ''
              }
            >
              <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
                <span>{formatKickoffLocal(m.kickoff_at)}</span>
                <span className="flex gap-2">
                  <span className="capitalize">{formatStage(m.stage)}</span>
                  <span
                    className={
                      m.status === 'live'
                        ? 'font-bold uppercase text-red-500'
                        : 'uppercase'
                    }
                  >
                    {m.status.replace(/_/g, ' ')}
                  </span>
                </span>
              </div>
              <p className="mt-2 font-semibold">
                <span className={m.home_team_id === assignedTeamId ? 'text-[var(--team-primary)]' : ''}>
                  {m.home?.name}
                </span>{' '}
                {score}{' '}
                <span className={m.away_team_id === assignedTeamId ? 'text-[var(--team-primary)]' : ''}>
                  {m.away?.name}
                </span>
              </p>
              {m.odds && (
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-[var(--background)] p-2">
                    <div className="text-[var(--muted)]">Home win</div>
                    <div className="font-bold">{formatPoints(m.odds.home_win_decimal)}</div>
                  </div>
                  <div className="rounded bg-[var(--background)] p-2">
                    <div className="text-[var(--muted)]">Draw</div>
                    <div className="font-bold">{formatPoints(m.odds.draw_decimal)}</div>
                  </div>
                  <div className="rounded bg-[var(--background)] p-2">
                    <div className="text-[var(--muted)]">Away win</div>
                    <div className="font-bold">{formatPoints(m.odds.away_win_decimal)}</div>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
        {!matchesQuery.data?.length && (
          <p className="text-sm text-[var(--muted)]">
            No fixtures yet. Run the <code className="text-xs">sync-fixtures</code> edge function in
            Supabase to import the World Cup 2026 schedule.
          </p>
        )}
      </div>
    </div>
  )
}
