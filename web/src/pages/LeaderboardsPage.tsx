import { useMemo, useState } from 'react'
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { TeamFlag } from '@/components/TeamFlag'
import { getFlagUrl } from '@/lib/flags'
import {
  formatPlayerLine,
  isRevealNamesEnabled,
  maskManagerNames,
  maskMemberName,
} from '@/lib/poolNames'
import { GroupMembersSection } from '@/components/GroupMembersSection'
import { isHostAssignmentMode } from '@/lib/poolAssignment'
import { formatStage, isYourTeamRow } from '@/lib/poolBoards'
import { formatFifaWorldRanking } from '@/lib/globalRank'
import { getTeamStaff } from '@/lib/teamStaff'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatPoints } from '@/lib/utils'
import type { PoolOutletContext } from '@/pages/PoolShell'

const BASE_LEADERBOARD_OPTIONS = [
  { id: 'all', label: 'All leaderboards' },
  { id: 'members', label: 'Group members' },
  { id: 'overall', label: 'Overall leaderboard' },
  { id: 'odds', label: 'Odds leaderboard' },
  { id: 'golden-boot', label: 'Golden Boot' },
  { id: 'golden-glove', label: 'Golden Glove' },
  { id: 'eliminations', label: 'Group eliminations' },
  { id: 'knockout', label: 'Knockout qualifiers' },
] as const

type LeaderboardId = (typeof BASE_LEADERBOARD_OPTIONS)[number]['id']
type SingleBoardId = Exclude<LeaderboardId, 'all'>

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

function filterSelectClass() {
  return (
    'h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm ' +
    'text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]'
  )
}

export function LeaderboardsPage() {
  const { poolId } = useParams<{ poolId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { assignedTeamId } = useOutletContext<PoolOutletContext>()

  const poolQuery = useQuery({
    queryKey: ['pool', poolId],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await supabase.from('pools').select('*').eq('id', poolId!).single()
      if (error) throw error
      return data
    },
  })

  const pool = poolQuery.data
  const isHostMode = isHostAssignmentMode(pool?.team_assignment_mode)
  const leaderboardOptions = BASE_LEADERBOARD_OPTIONS.filter(
    (option) => option.id !== 'members' || isHostMode,
  )

  const paramBoard = searchParams.get('board') as LeaderboardId | null
  const initialBoard =
    paramBoard && leaderboardOptions.some((o) => o.id === paramBoard) ? paramBoard : 'all'
  const [board, setBoard] = useState<LeaderboardId>(initialBoard)

  const show = (id: SingleBoardId) => board === 'all' || board === id

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

  const isHost = pool?.host_user_id === user?.id
  const nameVisibility = {
    revealNames: isRevealNamesEnabled(pool?.reveal_names),
    hostUserId: pool?.host_user_id ?? '',
    viewerUserId: user?.id,
  }

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

  const member = memberQuery.data
  const bootLeader = goldenBootLb.data?.[0]
  const gloveLeader = goldenGloveLb.data?.[0]
  const lowestKnockout = knockoutQuery.data?.[0]

  const boardMeta = useMemo(
    () => leaderboardOptions.find((o) => o.id === board) ?? leaderboardOptions[0],
    [board, leaderboardOptions],
  )

  function onBoardChange(id: LeaderboardId) {
    setBoard(id)
    if (id === 'all') {
      setSearchParams({}, { replace: true })
    } else {
      setSearchParams({ board: id }, { replace: true })
    }
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
          <h1 className="text-xl font-semibold tracking-tight">Sweep leaderboards</h1>
          <p className="text-sm text-[var(--muted)]">{boardMeta.label}</p>
        </div>
      </div>

      <Card className="p-4">
        <div className="space-y-1.5">
          <Label htmlFor="leaderboard-picker">Leaderboard</Label>
          <select
            id="leaderboard-picker"
            className={filterSelectClass()}
            value={board}
            onChange={(e) => onBoardChange(e.target.value as LeaderboardId)}
          >
            {leaderboardOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {show('members') && isHostMode && poolId && (
        <section className={board === 'all' ? 'space-y-3 border-b border-[var(--border)] pb-8' : ''}>
          <GroupMembersSection
            poolId={poolId}
            isHost={isHost}
            revealNames={nameVisibility.revealNames}
            hostUserId={nameVisibility.hostUserId}
            viewerUserId={user?.id}
          />
        </section>
      )}

      {show('overall') && (
        <section className={board === 'all' ? 'space-y-3 border-b border-[var(--border)] pb-8' : ''}>
          <h2 className="mb-2 text-lg font-semibold">Overall leaderboard</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Your nation&apos;s progress in the World Cup, with global FIFA ranking for each team.
          </p>
          <div className="space-y-2">
            {tournamentLb.data?.map((row, i) => {
              const you = isYourTeamRow(member?.id, row.pool_member_ids)
              const staff = getTeamStaff(row.fifa_code)
              const playerCount = row.co_manager_count
              const managerLabels = maskManagerNames(
                row.manager_names,
                row.pool_member_ids,
                nameVisibility,
              )
              return (
                <LeaderboardRow key={row.team_id} highlight={you}>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <TeamFlag fifaCode={row.fifa_code} size={40} title={row.team_name} />
                    <div className="min-w-0">
                      <span className="font-medium">
                        {row.team_name} #{i + 1}
                        {you && (
                          <span className="ml-1 text-xs font-normal text-fifa-green">(you)</span>
                        )}
                      </span>
                      {row.tournament_rank != null && (
                        <p className="text-xs text-[var(--muted)]">
                          Tournament position #{row.tournament_rank}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {formatPlayerLine(
                          managerLabels,
                          row.pool_member_ids,
                          playerCount,
                          nameVisibility,
                          member?.id,
                        )}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        Manager: {staff.headCoach} · Captain: {staff.captain}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {formatFifaWorldRanking(row.global_fifa_rank)}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs uppercase text-[var(--muted)]">
                    {formatStage(row.tournament_stage)}
                  </span>
                </LeaderboardRow>
              )
            })}
          </div>
        </section>
      )}

      {show('odds') && (
        <section className={board === 'all' ? 'space-y-3 border-b border-[var(--border)] pb-8' : ''}>
          <h2 className="mb-2 text-lg font-semibold">Odds leaderboard</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Score based on live betting odds 2hrs before Kick-Off. Score = Odds on to Win, draw or
            lose
          </p>
          <div className="space-y-2">
            {oddsLb.data?.map((row, i) => {
              const playerLabel = maskMemberName(row.display_name, nameVisibility, row.user_id)
              const showName = playerLabel !== 'Hidden player'
              const staff = row.fifa_code ? getTeamStaff(row.fifa_code) : null
              const isYou = member?.id === row.pool_member_id
              return (
                <LeaderboardRow key={row.pool_member_id} highlight={isYou}>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {row.fifa_code ? (
                      <TeamFlag fifaCode={row.fifa_code} size={40} title={row.team_name ?? ''} />
                    ) : (
                      <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-[var(--background)] text-xs text-[var(--muted)]">
                        TBD
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="font-medium">
                        {row.team_name ?? 'Awaiting team'} #{i + 1}
                        {isYou && (
                          <span className="ml-1 text-xs font-normal text-fifa-green">(you)</span>
                        )}
                      </span>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {showName ? `Player: ${playerLabel}` : 'Player: Hidden player'}
                      </p>
                      {staff && (
                        <>
                          <p className="text-xs text-[var(--muted)]">
                            Manager: {staff.headCoach} · Captain: {staff.captain}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            {formatFifaWorldRanking(row.global_fifa_rank)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 font-bold text-[var(--team-primary)]">
                    {formatPoints(row.total_points)} pts
                  </span>
                </LeaderboardRow>
              )
            })}
            {!oddsLb.data?.length && (
              <p className="text-sm text-[var(--muted)]">No points yet.</p>
            )}
          </div>
        </section>
      )}

      {show('golden-boot') && (
        <section className={board === 'all' ? 'space-y-3 border-b border-[var(--border)] pb-8' : ''}>
          <h2 className="mb-2 text-lg font-semibold">Golden Boot</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Top scorers by national team. If the tournament Golden Boot winner plays for your
            assigned nation, you win this part of the pool.
          </p>
          {bootLeader && (
            <p className="mb-3 rounded-lg border border-fifa-gold/40 bg-fifa-gold/10 px-3 py-2 text-sm">
              Leading: <strong>{bootLeader.golden_boot_player_name}</strong> ({bootLeader.team_name}) —{' '}
              {bootLeader.golden_boot_goals} goals
            </p>
          )}
          <div className="space-y-2">
            {goldenBootLb.data?.map((row) => {
              const you = isYourTeamRow(member?.id, row.pool_member_ids)
              return (
                <LeaderboardRow key={row.team_id} highlight={you}>
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={getFlagUrl(row.fifa_code, 80)}
                      alt=""
                      className="h-8 w-12 shrink-0 rounded object-cover"
                    />
                    <div className="min-w-0">
                      <span className="font-medium">
                        #{row.boot_rank} {row.golden_boot_player_name}
                      </span>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {row.team_name} #{row.boot_rank}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {formatFifaWorldRanking(row.global_fifa_rank)}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-bold text-[var(--team-primary)]">
                    {row.golden_boot_goals} goals
                  </span>
                </LeaderboardRow>
              )
            })}
          </div>
        </section>
      )}

      {show('golden-glove') && (
        <section className={board === 'all' ? 'space-y-3 border-b border-[var(--border)] pb-8' : ''}>
          <h2 className="mb-2 text-lg font-semibold">Golden Glove</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Top goalkeepers by national team.
          </p>
          {gloveLeader && (
            <p className="mb-3 rounded-lg border border-fifa-gold/40 bg-fifa-gold/10 px-3 py-2 text-sm">
              Leading: <strong>{gloveLeader.golden_glove_player_name}</strong> ({gloveLeader.team_name}) —{' '}
              {gloveLeader.golden_glove_clean_sheets} clean sheets
            </p>
          )}
          <div className="space-y-2">
            {goldenGloveLb.data?.map((row) => {
              const you = isYourTeamRow(member?.id, row.pool_member_ids)
              return (
                <LeaderboardRow key={row.team_id} highlight={you}>
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={getFlagUrl(row.fifa_code, 80)}
                      alt=""
                      className="h-8 w-12 shrink-0 rounded object-cover"
                    />
                    <div className="min-w-0">
                      <span className="font-medium">
                        #{row.glove_rank} {row.golden_glove_player_name}
                      </span>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {row.team_name} #{row.glove_rank}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {formatFifaWorldRanking(row.global_fifa_rank)}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-bold text-[var(--team-primary)]">
                    {row.golden_glove_clean_sheets} CS
                  </span>
                </LeaderboardRow>
              )
            })}
          </div>
        </section>
      )}

      {show('eliminations') && (
        <section className={board === 'all' ? 'space-y-3 border-b border-[var(--border)] pb-8' : ''}>
          <h2 className="mb-2 text-lg font-semibold">Group stage eliminations</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Nations eliminated in the group stage, ordered by global FIFA rank.
          </p>
          <div className="space-y-2">
            {eliminationsQuery.data?.map((row, i) => (
              <LeaderboardRow
                key={row.team_id}
                highlight={assignedTeamId === row.team_id}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={getFlagUrl(row.fifa_code, 80)}
                    alt=""
                    className="h-8 w-12 rounded object-cover"
                  />
                  <div className="min-w-0">
                    <span className="font-medium">
                      {row.team_name} #{i + 1}
                    </span>
                    <p className="text-xs text-[var(--muted)]">
                      {formatFifaWorldRanking(row.global_fifa_rank)}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  {row.group_letter ? `Group ${row.group_letter}` : 'eliminated'}
                </span>
              </LeaderboardRow>
            ))}
          </div>
        </section>
      )}

      {show('knockout') && (
        <section className={board === 'all' ? 'space-y-3' : ''}>
          <h2 className="mb-2 text-lg font-semibold">Knockout qualifiers</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Teams that advanced from the groups into the knockout round.
          </p>
          {lowestKnockout && (
            <p className="mb-3 rounded-lg border border-[var(--team-primary)]/40 px-3 py-2 text-sm">
              Lowest-ranked qualifier: <strong>{lowestKnockout.team_name}</strong>
            </p>
          )}
          <div className="space-y-2">
            {knockoutQuery.data?.map((row, i) => {
              const isLowest = row.team_id === lowestKnockout?.team_id
              const you = assignedTeamId === row.team_id
              return (
                <LeaderboardRow key={row.team_id} highlight={you || isLowest}>
                  <div className="flex items-center gap-3">
                    <img
                      src={getFlagUrl(row.fifa_code, 80)}
                      alt=""
                      className="h-8 w-12 rounded object-cover"
                    />
                    <div className="min-w-0">
                      <span className="font-medium">
                        {row.team_name} #{i + 1}
                      </span>
                      <p className="text-xs text-[var(--muted)]">
                        {formatFifaWorldRanking(row.global_fifa_rank)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs uppercase text-[var(--muted)]">
                    {formatStage(row.tournament_stage)}
                  </span>
                </LeaderboardRow>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
