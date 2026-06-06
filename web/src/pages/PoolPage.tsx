import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Share2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CoManagerBanner } from '@/components/CoManagerBanner'
import { TeamFlag } from '@/components/TeamFlag'
import { getFlagUrl } from '@/lib/flags'
import { formatStage, isYourTeamRow } from '@/lib/poolBoards'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatPoints } from '@/lib/utils'
import { getInviteUrl } from '@/lib/urls'

function LeaderboardRow({
  children,
  highlight,
}: {
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 leaderboard-row-accent ${
        highlight ? 'leaderboard-row-you' : ''
      }`}
    >
      {children}
    </div>
  )
}

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

  const goldenBootLb = useQuery({
    queryKey: ['leaderboard-golden-boot', poolId],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_golden_boot')
        .select('*')
        .eq('pool_id', poolId!)
        .order('boot_rank', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const goldenGloveLb = useQuery({
    queryKey: ['leaderboard-golden-glove', poolId],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_golden_glove')
        .select('*')
        .eq('pool_id', poolId!)
        .order('glove_rank', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const eliminationsQuery = useQuery({
    queryKey: ['board-eliminations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('board_group_eliminations')
        .select('*')
        .order('global_fifa_rank', { ascending: true, nullsFirst: false })
        .order('team_name', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const knockoutQuery = useQuery({
    queryKey: ['board-knockout'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('board_knockout_qualifiers')
        .select('*')
        .order('global_fifa_rank', { ascending: false, nullsFirst: false })
        .order('team_name', { ascending: true })
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

  const bootLeader = goldenBootLb.data?.[0]
  const gloveLeader = goldenGloveLb.data?.[0]
  const lowestKnockout = knockoutQuery.data?.[0]

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{pool.name}</h1>
          <p className="text-sm text-[var(--muted)]">World Cup 2026</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={shareInvite}>
            <Share2 className="h-4 w-4" /> Share link
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

      {member && (
        <Card className="border-[var(--primary)]/40 bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))] p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/15">
            <CalendarDays className="h-7 w-7 text-[var(--primary)]" aria-hidden />
          </div>
          <CardTitle className="text-xl">Fixtures &amp; results</CardTitle>
          <CardDescription className="mx-auto mt-2 max-w-sm">
            Full World Cup schedule with flags, filters, live scores, odds, and goal scorers.
          </CardDescription>
          <Button asChild size="lg" className="mt-5 w-full max-w-xs mx-auto shadow-sm">
            <Link to="fixtures">
              <CalendarDays className="h-5 w-5" />
              View all fixtures
            </Link>
          </Button>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Overall leaderboard</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Your nation&apos;s progress in the World Cup (by team).
        </p>
        <div className="space-y-2">
          {tournamentLb.data?.map((row, i) => {
            const you = isYourTeamRow(member?.id, row.pool_member_ids)
            return (
              <LeaderboardRow key={row.team_id} highlight={you}>
                <div>
                  <span className="font-medium">
                    #{row.tournament_rank ?? i + 1} {row.team_name}
                    {you && (
                      <span className="ml-1 text-xs font-normal text-fifa-green">(you)</span>
                    )}
                  </span>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    {row.co_manager_count === 1
                      ? '1 manager'
                      : `${row.co_manager_count} managers`}
                  </p>
                </div>
                <span className="text-xs uppercase text-[var(--muted)] shrink-0">
                  {formatStage(row.tournament_stage)}
                </span>
              </LeaderboardRow>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Odds points leaderboard</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Win = match win odds. Draw = draw odds for both teams involved. Teams only — no player names.
        </p>
        <div className="space-y-2">
          {oddsLb.data?.map((row, i) => (
            <LeaderboardRow
              key={row.pool_member_id}
              highlight={member?.id === row.pool_member_id}
            >
              <span className="font-medium">
                #{i + 1} {row.team_name}
                {member?.id === row.pool_member_id && (
                  <span className="ml-1 text-xs font-normal text-fifa-green">(you)</span>
                )}
              </span>
              <span className="font-bold text-[var(--team-primary)]">
                {formatPoints(row.total_points)} pts
              </span>
            </LeaderboardRow>
          ))}
          {!oddsLb.data?.length && (
            <p className="text-sm text-[var(--muted)]">No points yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Golden Boot</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Top scorers by national team. If the tournament Golden Boot winner plays for your assigned
          nation, you win this part of the pool.
        </p>
        {bootLeader && (
          <p className="mb-3 rounded-lg border border-fifa-gold/40 bg-fifa-gold/10 px-3 py-2 text-sm">
            Leading: <strong>{bootLeader.golden_boot_player_name}</strong> ({bootLeader.team_name}) —{' '}
            {bootLeader.golden_boot_goals} goals
            {isYourTeamRow(member?.id, bootLeader.pool_member_ids) && (
              <span className="text-fifa-green font-medium"> · You&apos;re on this team</span>
            )}
          </p>
        )}
        <div className="space-y-2">
          {goldenBootLb.data?.map((row) => {
            const you = isYourTeamRow(member?.id, row.pool_member_ids)
            return (
              <LeaderboardRow key={row.team_id} highlight={you}>
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={getFlagUrl(row.fifa_code, 80)}
                    alt=""
                    className="h-8 w-12 shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0">
                    <span className="font-medium">
                      #{row.boot_rank} {row.golden_boot_player_name}
                      {you && (
                        <span className="ml-1 text-xs font-normal text-fifa-green">(you)</span>
                      )}
                    </span>
                    <p className="text-xs text-[var(--muted)] truncate">{row.team_name}</p>
                  </div>
                </div>
                <span className="font-bold text-[var(--team-primary)] shrink-0">
                  {row.golden_boot_goals} goals
                </span>
              </LeaderboardRow>
            )
          })}
          {!goldenBootLb.data?.length && (
            <p className="text-sm text-[var(--muted)]">No Golden Boot data yet (admin can add players).</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Golden Glove</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Top goalkeepers by national team. If the tournament Golden Glove winner is your assigned
          nation&apos;s keeper, you win this part of the pool.
        </p>
        {gloveLeader && (
          <p className="mb-3 rounded-lg border border-fifa-gold/40 bg-fifa-gold/10 px-3 py-2 text-sm">
            Leading: <strong>{gloveLeader.golden_glove_player_name}</strong> ({gloveLeader.team_name}) —{' '}
            {gloveLeader.golden_glove_clean_sheets} clean sheets
            {isYourTeamRow(member?.id, gloveLeader.pool_member_ids) && (
              <span className="text-fifa-green font-medium"> · You&apos;re on this team</span>
            )}
          </p>
        )}
        <div className="space-y-2">
          {goldenGloveLb.data?.map((row) => {
            const you = isYourTeamRow(member?.id, row.pool_member_ids)
            return (
              <LeaderboardRow key={row.team_id} highlight={you}>
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={getFlagUrl(row.fifa_code, 80)}
                    alt=""
                    className="h-8 w-12 shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0">
                    <span className="font-medium">
                      #{row.glove_rank} {row.golden_glove_player_name}
                      {you && (
                        <span className="ml-1 text-xs font-normal text-fifa-green">(you)</span>
                      )}
                    </span>
                    <p className="text-xs text-[var(--muted)] truncate">{row.team_name}</p>
                  </div>
                </div>
                <span className="font-bold text-[var(--team-primary)] shrink-0">
                  {row.golden_glove_clean_sheets} CS
                </span>
              </LeaderboardRow>
            )
          })}
          {!goldenGloveLb.data?.length && (
            <p className="text-sm text-[var(--muted)]">No Golden Glove data yet (admin can add keepers).</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Group stage eliminations</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Nations eliminated in the group stage, ordered by global FIFA rank (strongest rank number
          first).
        </p>
        <div className="space-y-2">
          {eliminationsQuery.data?.map((row, i) => (
            <LeaderboardRow
              key={row.team_id}
              highlight={member?.assigned_team_id === row.team_id}
            >
              <div className="flex items-center gap-3">
                <img
                  src={getFlagUrl(row.fifa_code, 80)}
                  alt=""
                  className="h-8 w-12 rounded object-cover"
                />
                <span className="font-medium">
                  {row.global_fifa_rank != null ? `FIFA #${row.global_fifa_rank}` : `#${i + 1}`}{' '}
                  {row.team_name}
                  {member?.assigned_team_id === row.team_id && (
                    <span className="ml-1 text-xs text-fifa-green">(you)</span>
                  )}
                </span>
              </div>
              <span className="text-xs text-[var(--muted)]">
                {row.group_letter ? `Group ${row.group_letter}` : 'eliminated'}
              </span>
            </LeaderboardRow>
          ))}
          {!eliminationsQuery.data?.length && (
            <p className="text-sm text-[var(--muted)]">No eliminated teams marked yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Knockout qualifiers</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Teams that advanced from the groups into the knockout round. Highlighted: lowest global
          FIFA rank among qualifiers (weakest nation through).
        </p>
        {lowestKnockout && (
          <p className="mb-3 rounded-lg border border-[var(--team-primary)]/40 bg-[color-mix(in_srgb,var(--team-primary)_10%,var(--card))] px-3 py-2 text-sm">
            Lowest-ranked qualifier: <strong>{lowestKnockout.team_name}</strong>
            {lowestKnockout.global_fifa_rank != null && (
              <> (FIFA #{lowestKnockout.global_fifa_rank})</>
            )}
            {member?.assigned_team_id === lowestKnockout.team_id && (
              <span className="text-fifa-green font-medium"> · That&apos;s your team</span>
            )}
          </p>
        )}
        <div className="space-y-2">
          {knockoutQuery.data?.map((row) => {
            const isLowest = row.team_id === lowestKnockout?.team_id
            const you = member?.assigned_team_id === row.team_id
            return (
              <LeaderboardRow key={row.team_id} highlight={you || isLowest}>
                <div className="flex items-center gap-3">
                  <img
                    src={getFlagUrl(row.fifa_code, 80)}
                    alt=""
                    className="h-8 w-12 rounded object-cover"
                  />
                  <span className="font-medium">
                    {row.global_fifa_rank != null ? `FIFA #${row.global_fifa_rank}` : '—'}{' '}
                    {row.team_name}
                    {you && <span className="ml-1 text-xs text-fifa-green">(you)</span>}
                    {isLowest && !you && (
                      <span className="ml-1 text-xs text-amber-500">(lowest ranked through)</span>
                    )}
                  </span>
                </div>
                <span className="text-xs uppercase text-[var(--muted)]">
                  {formatStage(row.tournament_stage)}
                </span>
              </LeaderboardRow>
            )
          })}
          {!knockoutQuery.data?.length && (
            <p className="text-sm text-[var(--muted)]">No knockout teams marked yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
