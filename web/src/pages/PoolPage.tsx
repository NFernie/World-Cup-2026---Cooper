import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Share2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CoManagerBanner } from '@/components/CoManagerBanner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatPoints } from '@/lib/utils'
import { getInviteUrl } from '@/lib/urls'

export function PoolPage() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user, isSuperAdmin } = useAuth()

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

  const assignedTeamQuery = useQuery({
    queryKey: ['assigned-team', memberQuery.data?.assigned_team_id],
    enabled: Boolean(memberQuery.data?.assigned_team_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('name, fifa_code')
        .eq('id', memberQuery.data!.assigned_team_id)
        .single()
      if (error) throw error
      return data
    },
  })

  const oddsLb = useQuery({
    queryKey: ['leaderboard-odds', poolId],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_odds_points')
        .select('*')
        .eq('pool_id', poolId!)
        .order('total_points', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const tournamentLb = useQuery({
    queryKey: ['leaderboard-tournament', poolId],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_tournament_standing')
        .select('*')
        .eq('pool_id', poolId!)
        .order('tournament_rank', { ascending: true, nullsFirst: false })
        .order('group_points', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  if (poolQuery.isLoading) return <p className="text-[var(--muted)]">Loading…</p>
  if (!poolQuery.data) return <p className="text-red-600">Pool not found.</p>

  const pool = poolQuery.data
  const inviteUrl = getInviteUrl(pool.invite_code)
  const member = memberQuery.data
  const team = assignedTeamQuery.data
  const isHost = user?.id === pool.host_user_id

  const shareInvite = async () => {
    const text = `Join my WC26 pool "${pool.name}": ${inviteUrl}`
    if (navigator.share) {
      await navigator.share({ title: pool.name, text, url: inviteUrl })
    } else {
      await navigator.clipboard.writeText(inviteUrl)
      alert('Invite link copied to clipboard.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{pool.name}</h1>
          <p className="text-sm text-[var(--muted)]">World Cup 2026</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={shareInvite}>
            <Share2 className="h-4 w-4" /> Share link
          </Button>
          {member && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/pools/${pool.id}/fixtures`}>
                <CalendarDays className="h-4 w-4" /> Fixtures
              </Link>
            </Button>
          )}
          {isSuperAdmin && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin?pool=${pool.id}`}>
                <Shield className="h-4 w-4" /> Admin
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!member && user && (
        <Card>
          <CardTitle>{isHost ? 'Join your pool as a player' : 'Not in this pool yet'}</CardTitle>
          <CardDescription className="mt-1">
            {isHost
              ? 'Hosts need to join to get a team assignment and points in this pool.'
              : 'Use the invite link to join with your display name.'}
          </CardDescription>
          <Button asChild className="mt-3">
            <Link to={`/join/${pool.invite_code}`}>Join pool</Link>
          </Button>
        </Card>
      )}

      {member && team && (
        <Card className="border-[var(--team-primary)]/50">
          <CardTitle>Your team: {team.name}</CardTitle>
          <CardDescription>{team.fifa_code} · assigned for this pool only</CardDescription>
          <div className="mt-3">
            <CoManagerBanner
              poolId={pool.id}
              teamId={member.assigned_team_id}
              teamName={team.name}
              currentMemberId={member.id}
            />
          </div>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Odds points leaderboard</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Win = match win odds. Draw = draw odds for both teams involved.
        </p>
        <div className="space-y-2">
          {oddsLb.data?.map((row, i) => (
            <div
              key={row.pool_member_id}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
            >
              <span className="font-medium">
                #{i + 1} {row.display_name}{' '}
                <span className="text-[var(--muted)]">({row.team_name})</span>
              </span>
              <span className="font-bold text-[var(--team-primary)]">
                {formatPoints(row.total_points)} pts
              </span>
            </div>
          ))}
          {!oddsLb.data?.length && (
            <p className="text-sm text-[var(--muted)]">No points yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tournament standing</h2>
        <div className="space-y-2">
          {tournamentLb.data?.map((row, i) => (
            <div
              key={row.team_id}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium">
                  #{row.tournament_rank ?? i + 1} {row.team_name}
                </span>
                <span className="text-xs uppercase text-[var(--muted)]">
                  {row.tournament_stage.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">
                Managers: {row.manager_names.join(', ')}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
