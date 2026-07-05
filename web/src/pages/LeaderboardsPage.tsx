import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { TeamFlag } from '@/components/TeamFlag'
import { TeamLeaderboardRow } from '@/components/TeamLeaderboardRow'
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
import { useMatchSyncRealtime } from '@/hooks/useMatchSyncRealtime'
import { formatPoints } from '@/lib/utils'

const BASE_LEADERBOARD_OPTIONS = [
  { id: 'all', label: 'All leaderboards' },
  { id: 'members', label: 'Group members' },
  { id: 'overall', label: 'Overall leaderboard' },
  { id: 'odds', label: 'Odds leaderboard' },
  { id: 'golden-boot', label: 'Golden Boot' },
  { id: 'golden-glove', label: 'Golden Glove' },
  { id: 'eliminations', label: 'Wooden spoon' },
  { id: 'knockout', label: "People's champion" },
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

  useMatchSyncRealtime()

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

  const woodenSpoonLb = useQuery({
    queryKey: ['leaderboard-wooden-spoon', poolId],
    enabled: Boolean(poolId),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_wooden_spoon')
        .select('*')
        .eq('pool_id', poolId!)
        .order('spoon_rank', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const peoplesChampionLb = useQuery({
    queryKey: ['leaderboard-peoples-champion', poolId],
    enabled: Boolean(poolId),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_peoples_champion')
        .select('*')
        .eq('pool_id', poolId!)
        .order('champion_rank', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const member = memberQuery.data
  const bootLeader = goldenBootLb.data?.[0]
  const gloveLeader = goldenGloveLb.data?.[0]
  const woodenSpoonHolder = woodenSpoonLb.data?.[0]
  const peoplesChampion = peoplesChampionLb.data?.[0]

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
            Your nation&apos;s progress in the World Cup, ranked by group points and goal difference.
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
                      {row.group_letter && (
                        <p className="text-xs text-[var(--muted)]">
                          Group {row.group_letter}
                          {row.group_position != null ? ` · #${row.group_position}` : ''}
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
                        Head coach: {staff.headCoach} · Captain: {staff.captain}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {formatFifaWorldRanking(row.global_fifa_rank)}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-[var(--team-primary)]">
                      {row.group_points} pts
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      GD {row.group_goal_difference >= 0 ? '+' : ''}
                      {row.group_goal_difference}
                    </p>
                    <p className="mt-1 text-xs uppercase text-[var(--muted)]">
                      {formatStage(row.tournament_stage)}
                    </p>
                  </div>
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
                        {showName ? `Manager: ${playerLabel}` : 'Manager: Hidden player'}
                      </p>
                      {staff && (
                        <>
                          <p className="text-xs text-[var(--muted)]">
                            Head coach: {staff.headCoach} · Captain: {staff.captain}
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
                <TeamLeaderboardRow
                  key={row.team_id}
                  rank={row.boot_rank}
                  teamName={row.team_name}
                  fifaCode={row.fifa_code}
                  groupLetter={row.group_letter}
                  groupPosition={row.group_position}
                  managerNames={row.manager_names}
                  poolMemberIds={row.pool_member_ids}
                  coManagerCount={row.co_manager_count}
                  globalFifaRank={row.global_fifa_rank}
                  nameVisibility={nameVisibility}
                  viewerMemberId={member?.id}
                  highlight={you}
                  isYou={you}
                  awardLine={
                    row.golden_boot_player_name
                      ? `Top scorer: ${row.golden_boot_player_name}`
                      : undefined
                  }
                  right={
                    <span className="font-bold text-[var(--team-primary)]">
                      {row.golden_boot_goals} goals
                    </span>
                  }
                />
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
                <TeamLeaderboardRow
                  key={row.team_id}
                  rank={row.glove_rank}
                  teamName={row.team_name}
                  fifaCode={row.fifa_code}
                  groupLetter={row.group_letter}
                  groupPosition={row.group_position}
                  managerNames={row.manager_names}
                  poolMemberIds={row.pool_member_ids}
                  coManagerCount={row.co_manager_count}
                  globalFifaRank={row.global_fifa_rank}
                  nameVisibility={nameVisibility}
                  viewerMemberId={member?.id}
                  highlight={you}
                  isYou={you}
                  awardLine={
                    row.golden_glove_player_name
                      ? `Goalkeeper: ${row.golden_glove_player_name}`
                      : undefined
                  }
                  right={
                    <span className="font-bold text-[var(--team-primary)]">
                      {row.golden_glove_clean_sheets} CS
                    </span>
                  }
                />
              )
            })}
          </div>
        </section>
      )}

      {show('eliminations') && (
        <section className={board === 'all' ? 'space-y-3 border-b border-[var(--border)] pb-8' : ''}>
          <h2 className="mb-2 text-lg font-semibold">Wooden spoon</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Group-stage exits ranked highest FIFA rank first — the top team holds the wooden spoon.
            Locked at the end of the group stage (before Round of 32 kick-off on 29 June).
          </p>
          {woodenSpoonHolder && (
            <p className="mb-3 rounded-lg border border-[var(--team-primary)]/40 px-3 py-2 text-sm">
              Wooden spoon: <strong>{woodenSpoonHolder.team_name}</strong>
            </p>
          )}
          <div className="space-y-2">
            {woodenSpoonLb.data?.map((row) => {
              const isSpoon = row.spoon_rank === 1
              const you = isYourTeamRow(member?.id, row.pool_member_ids)
              return (
                <TeamLeaderboardRow
                  key={row.team_id}
                  rank={row.spoon_rank}
                  teamName={row.team_name}
                  fifaCode={row.fifa_code}
                  groupLetter={row.group_letter}
                  groupPosition={row.group_position}
                  managerNames={row.manager_names}
                  poolMemberIds={row.pool_member_ids}
                  coManagerCount={row.co_manager_count}
                  globalFifaRank={row.global_fifa_rank}
                  nameVisibility={nameVisibility}
                  viewerMemberId={member?.id}
                  highlight={you || isSpoon}
                  isYou={you}
                  right={
                    <span className="text-xs uppercase text-[var(--muted)]">eliminated</span>
                  }
                />
              )
            })}
          </div>
        </section>
      )}

      {show('knockout') && (
        <section className={board === 'all' ? 'space-y-3' : ''}>
          <h2 className="mb-2 text-lg font-semibold">People&apos;s champion</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Teams through the group stage, ranked lowest FIFA rank first — the top team is
            people&apos;s champion. Locked at the end of the group stage (before Round of 32
            kick-off on 29 June).
          </p>
          {peoplesChampion && (
            <p className="mb-3 rounded-lg border border-[var(--team-primary)]/40 px-3 py-2 text-sm">
              People&apos;s champion: <strong>{peoplesChampion.team_name}</strong>
            </p>
          )}
          <div className="space-y-2">
            {peoplesChampionLb.data?.map((row) => {
              const isChampion = row.champion_rank === 1
              const you = isYourTeamRow(member?.id, row.pool_member_ids)
              return (
                <TeamLeaderboardRow
                  key={row.team_id}
                  rank={row.champion_rank}
                  teamName={row.team_name}
                  fifaCode={row.fifa_code}
                  groupLetter={row.group_letter}
                  groupPosition={row.group_position}
                  managerNames={row.manager_names}
                  poolMemberIds={row.pool_member_ids}
                  coManagerCount={row.co_manager_count}
                  globalFifaRank={row.global_fifa_rank}
                  nameVisibility={nameVisibility}
                  viewerMemberId={member?.id}
                  highlight={you || isChampion}
                  isYou={you}
                  right={
                    <span className="text-xs uppercase text-[var(--muted)]">
                      {formatStage(row.tournament_stage)}
                    </span>
                  }
                />
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
