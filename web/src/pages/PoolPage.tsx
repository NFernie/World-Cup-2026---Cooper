import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  CalendarDays,
  Dices,
  Lock,
  Share2,
  Shield,
  TableProperties,
  Trophy,
  Unlock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { BanterBox } from '@/components/BanterBox'
import { GameRulesDialog } from '@/components/GameRulesDialog'
import { CoManagerBanner } from '@/components/CoManagerBanner'
import {
  NextTeamMatchCountdown,
  WorldCupCountdown,
  type CountdownMatch,
} from '@/components/CountdownCards'
import { LiveMatchesSection } from '@/components/LiveMatchesSection'
import { RevealNamesControl } from '@/components/RevealNamesControl'
import { RevealNamesPoll } from '@/components/RevealNamesPoll'
import { TeamFlag } from '@/components/TeamFlag'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isHostAssignmentMode } from '@/lib/poolAssignment'
import { formatPlayerLine, isRevealNamesEnabled, maskMemberName } from '@/lib/poolNames'
import { getGroupJoinUrl } from '@/lib/urls'

const TOTAL_NATIONS = 48

type TeamSummary = {
  id: string
  name: string
  fifa_code: string
  group_letter: string | null
  global_fifa_rank: number | null
}

type PoolMemberSummary = {
  id: string
  user_id: string
  display_name: string
  assigned_team_id: string | null
}

export function PoolPage() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user, isSuperAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [rulesOpen, setRulesOpen] = useState(false)

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

  const firstKickoffQuery = useQuery({
    queryKey: ['first-world-cup-kickoff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('kickoff_at')
        .order('kickoff_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data?.kickoff_at as string | undefined
    },
  })

  const nextTeamMatchQuery = useQuery({
    queryKey: ['next-team-match', memberQuery.data?.assigned_team_id],
    enabled: Boolean(memberQuery.data?.assigned_team_id),
    refetchInterval: 60_000,
    queryFn: async () => {
      const teamId = memberQuery.data!.assigned_team_id
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .gt('kickoff_at', new Date().toISOString())
        .order('kickoff_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (matchError) throw matchError
      if (!match) return null

      const [{ data: teams, error: teamsError }, { data: odds, error: oddsError }] =
        await Promise.all([
          supabase
            .from('teams')
            .select('id, name, fifa_code, group_letter, global_fifa_rank')
            .in('id', [match.home_team_id, match.away_team_id]),
          supabase.from('match_odds').select('*').eq('match_id', match.id).maybeSingle(),
        ])
      if (teamsError) throw teamsError
      if (oddsError) throw oddsError

      const teamMap = new Map((teams ?? []).map((t) => [t.id, t as TeamSummary]))
      const home = teamMap.get(match.home_team_id)
      const away = teamMap.get(match.away_team_id)
      if (!home || !away) return null

      return {
        ...match,
        home,
        away,
        odds: odds
          ? {
              home_win_decimal: odds.home_win_decimal,
              draw_decimal: odds.draw_decimal,
              away_win_decimal: odds.away_win_decimal,
            }
          : null,
      } as CountdownMatch
    },
  })

  const joinLockMutation = useMutation({
    mutationFn: async (locked: boolean) => {
      const { error } = await supabase.rpc('set_pool_join_locked', {
        p_pool_id: poolId!,
        p_join_locked: locked,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pool', poolId] })
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
  const joinLocked = pool.join_locked === true
  const namesRevealed = isRevealNamesEnabled(pool.reveal_names)
  const isHostAssignment = isHostAssignmentMode(pool.team_assignment_mode)
  const nameVisibility = {
    revealNames: namesRevealed,
    hostUserId: pool.host_user_id,
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
      member?.id,
    )
  }

  const nextTeamMatch = nextTeamMatchQuery.data
    ? {
        ...nextTeamMatchQuery.data,
        homePlayerLine: playerLineForTeam(nextTeamMatchQuery.data.home_team_id),
        awayPlayerLine: playerLineForTeam(nextTeamMatchQuery.data.away_team_id),
      }
    : nextTeamMatchQuery.data

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
          <Button variant="outline" size="sm" onClick={() => setRulesOpen(true)}>
            <BookOpen className="h-4 w-4" /> Game rules
          </Button>
          <Button variant="outline" size="sm" onClick={shareGroup}>
            <Share2 className="h-4 w-4" /> Share group
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

      <GameRulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <WorldCupCountdown firstKickoffAt={firstKickoffQuery.data} />

      {!member && user && (
        <Card>
          <CardTitle>{isHost ? 'Join your pool as a player' : 'Not in this pool yet'}</CardTitle>
          <CardDescription className="mt-1">
            {isHost
              ? isHostAssignment
                ? 'Join to appear on the group leaderboard, then assign nations to members.'
                : 'Hosts need to join to get a team assignment and points in this pool.'
              : 'Use the invite link to join with your display name.'}
          </CardDescription>
          <Button asChild className="mt-3">
            <Link to={`/join/${pool.invite_code}`}>Join pool</Link>
          </Button>
        </Card>
      )}

      {member && !team && (
        <Card className="border-[var(--border)] bg-[var(--card)]">
          <CardTitle className="text-xl">Awaiting team assignment</CardTitle>
          <CardDescription className="mt-1">
            {isHostAssignment && isHost
              ? 'You are on the leaderboard without a nation yet. Assign teams from the leaderboard when members have joined.'
              : isHostAssignment
                ? 'Your host will assign your nation from the group leaderboard.'
                : 'Your nation has not been assigned yet.'}
          </CardDescription>
          {(isHostAssignment || isHost) && (
            <Button asChild className="mt-4" variant="outline">
              <Link to="leaderboards?board=members">Open group leaderboard</Link>
            </Button>
          )}
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
              revealNames={namesRevealed}
              hostUserId={pool.host_user_id}
              viewerUserId={user?.id}
            />
          </div>
        </Card>
      )}

      {member && (
        <LiveMatchesSection
          assignedTeamId={member.assigned_team_id}
          playerLineForTeam={playerLineForTeam}
        />
      )}

      {member && (
        <NextTeamMatchCountdown
          match={nextTeamMatch}
          assignedTeamId={member.assigned_team_id}
        />
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

          {isHost && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {joinLocked ? 'Sign-ups are closed' : 'Sign-ups are open'}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {joinLocked
                      ? playerCount >= TOTAL_NATIONS
                        ? 'This group is full — no more players can join.'
                        : `Sign-ups are closed, but new players can still join until the group reaches ${TOTAL_NATIONS} (${TOTAL_NATIONS - playerCount} spot${TOTAL_NATIONS - playerCount === 1 ? '' : 's'} left).`
                      : `Close sign-ups to cap the group at ${TOTAL_NATIONS} players.`}
                  </p>
                </div>
                <Button
                  variant={joinLocked ? 'default' : 'outline'}
                  size="sm"
                  disabled={joinLockMutation.isPending}
                  onClick={() => joinLockMutation.mutate(!joinLocked)}
                >
                  {joinLocked ? (
                    <>
                      <Unlock className="h-4 w-4" /> Re-open sign-ups
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" /> Close sign-ups (cap at 48)
                    </>
                  )}
                </Button>
              </div>
              {joinLockMutation.error && (
                <p className="mt-2 text-sm text-red-600">
                  {(joinLockMutation.error as Error).message}
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {member && (
        <div className="space-y-4">
          <Card className="border-[var(--border)] bg-[var(--card)] p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/10">
              <TableProperties className="h-7 w-7 text-[var(--primary)]" aria-hidden />
            </div>
            <CardTitle className="text-xl">World Cup table</CardTitle>
            <CardDescription className="mx-auto mt-2 max-w-sm">
              Group standings with W/D/L and points, plus the knockout bracket as teams qualify.
            </CardDescription>
            <Button asChild size="lg" className="mx-auto mt-5 w-full max-w-xs shadow-sm">
              <Link to="table">
                <TableProperties className="h-5 w-5" />
                View table
              </Link>
            </Button>
          </Card>

          <Card className="border-[var(--primary)]/40 bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))] p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/15">
              <CalendarDays className="h-7 w-7 text-[var(--primary)]" aria-hidden />
            </div>
            <CardTitle className="text-xl">Fixtures &amp; results</CardTitle>
            <CardDescription className="mx-auto mt-2 max-w-sm">
              Full World Cup schedule with flags, filters, live scores, odds, and match events.
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
              Overall standings, odds points, Golden Boot, Golden Glove, wooden spoon, and
              people&apos;s champion.
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

      {member && (
        <Card className="border-[var(--primary)]/40 bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))] p-5 text-center sm:mx-auto sm:max-w-lg">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/15">
            <Dices className="h-7 w-7 text-[var(--primary)]" aria-hidden />
          </div>
          <CardTitle className="text-xl">Can you win the World Cup?</CardTitle>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Beta
          </p>
          <CardDescription className="mx-auto mt-2 max-w-sm">
            Spin a random nation, draft an XI into your formation, and see how far your dream
            team goes. Just for fun — it doesn&apos;t affect your sweep.
          </CardDescription>
          <Button asChild size="lg" className="mx-auto mt-5 w-full max-w-xs shadow-sm">
            <Link to="xi-game">
              <Dices className="h-5 w-5" />
              Play the game
            </Link>
          </Button>
        </Card>
      )}

      {member && (
        <BanterBox
          poolId={pool.id}
          memberId={member.id}
          displayName={member.display_name}
          userId={user?.id}
        />
      )}

      {(member || isHost) && (
        <div className="space-y-4">
          <RevealNamesControl
            poolId={pool.id}
            revealNames={namesRevealed}
            isHost={isHost}
          />
          {member && (
            <RevealNamesPoll
              poolId={pool.id}
              memberId={member.id}
              isHost={isHost}
              revealNames={namesRevealed}
            />
          )}
        </div>
      )}
    </div>
  )
}
