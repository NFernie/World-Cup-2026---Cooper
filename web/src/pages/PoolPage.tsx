import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Share2, Shield, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CoManagerBanner } from '@/components/CoManagerBanner'
import { TeamFlag } from '@/components/TeamFlag'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { getGroupJoinUrl } from '@/lib/urls'

const TOTAL_NATIONS = 48

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

  const memberCountQuery = useQuery({
    queryKey: ['pool-member-count', poolId],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pool_members')
        .select('*', { count: 'exact', head: true })
        .eq('pool_id', poolId!)
      if (error) throw error
      return count ?? 0
    },
  })

  if (poolQuery.isLoading) return <p className="text-[var(--muted)]">Loading…</p>
  if (!poolQuery.data) return <p className="text-red-600">Pool not found.</p>

  const pool = poolQuery.data
  const groupJoinUrl = getGroupJoinUrl(pool.invite_code, pool.name)
  const member = memberQuery.data
  const team = assignedTeamQuery.data
  const isHost = user?.id === pool.host_user_id
  const playerCount = memberCountQuery.data ?? 0
  const playersNeeded = Math.max(0, TOTAL_NATIONS - playerCount)

  const shareGroup = async () => {
    const text = `Join my WC26 group "${pool.name}": ${groupJoinUrl}`
    if (navigator.share) {
      await navigator.share({ title: `Join ${pool.name}`, text, url: groupJoinUrl })
    } else {
      await navigator.clipboard.writeText(groupJoinUrl)
      alert('Group invite link copied. Recipients sign in, then group code and name are filled in automatically.')
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{pool.name}</h1>
          <p className="text-sm text-[var(--muted)]">World Cup 2026</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={shareGroup}>
            <Share2 className="h-4 w-4" /> Share Group
          </Button>
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
        <Card className="border-[var(--team-primary)]/60 bg-[color-mix(in_srgb,var(--team-primary)_12%,var(--card))]">
          <div className="flex items-center gap-4">
            <TeamFlag
              fifaCode={team.fifa_code}
              size={80}
              title={team.name}
              className="!h-12 !w-20 shrink-0 rounded-md shadow-md ring-2 ring-[var(--team-primary)]/30"
            />
            <div className="min-w-0">
              <CardTitle className="text-xl leading-tight">
                Your team: {team.name}
              </CardTitle>
              <CardDescription className="mt-1">
                {team.fifa_code} · assigned for this pool only
              </CardDescription>
            </div>
          </div>
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

      {(member || isHost) && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Sweep progress</p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-[var(--primary)]">
                {playerCount}/{TOTAL_NATIONS}
              </p>
              <p className="text-sm text-[var(--muted)]">players joined</p>
            </div>
            <div className="text-right text-sm text-[var(--muted)]">
              {playersNeeded === 0 ? (
                <span className="font-medium text-fifa-green">Full sweep — all nations covered</span>
              ) : (
                <>
                  <span className="font-medium text-[var(--foreground)]">
                    {playersNeeded} more player{playersNeeded === 1 ? '' : 's'} needed
                  </span>
                  <p className="mt-0.5">for a full 48-nation sweep</p>
                </>
              )}
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all"
              style={{ width: `${Math.min(100, (playerCount / TOTAL_NATIONS) * 100)}%` }}
            />
          </div>
        </Card>
      )}

      {member && (
        <div className="space-y-4">
          <Card className="border-[var(--primary)]/40 bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))] p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/15">
              <CalendarDays className="h-7 w-7 text-[var(--primary)]" aria-hidden />
            </div>
            <CardTitle className="text-xl">Fixtures &amp; results</CardTitle>
            <CardDescription className="mx-auto mt-2 max-w-sm">
              Full World Cup schedule with flags, filters, live scores, odds, and goal scorers.
            </CardDescription>
            <Button asChild size="lg" className="mx-auto mt-5 w-full max-w-xs shadow-sm">
              <Link to="fixtures">
                <CalendarDays className="h-5 w-5" />
                View all fixtures
              </Link>
            </Button>
          </Card>

          <Card className="border-fifa-gold/40 bg-[color-mix(in_srgb,var(--color-fifa-gold)_8%,var(--card))] p-5 text-center sm:mx-auto sm:max-w-lg">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-fifa-gold/15">
              <Trophy className="h-7 w-7 text-fifa-gold" aria-hidden />
            </div>
            <CardTitle className="text-xl">Sweep leaderboards</CardTitle>
            <CardDescription className="mx-auto mt-2 max-w-sm">
              Overall standings, odds points, Golden Boot, Golden Glove, and knockout boards.
            </CardDescription>
            <Button asChild size="lg" className="mx-auto mt-5 w-full max-w-xs shadow-sm">
              <Link to="leaderboards">
                <Trophy className="h-5 w-5" />
                View leaderboards
              </Link>
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}
