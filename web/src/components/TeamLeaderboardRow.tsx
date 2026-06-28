import { TeamFlag } from '@/components/TeamFlag'
import { formatFifaWorldRanking } from '@/lib/globalRank'
import { formatPlayerLine, maskManagerNames, type PoolNameVisibility } from '@/lib/poolNames'
import { getTeamStaff } from '@/lib/teamStaff'

type Props = {
  rank: number
  teamName: string
  fifaCode: string
  groupLetter?: string | null
  groupPosition?: number | null
  managerNames: string[]
  poolMemberIds: string[]
  coManagerCount: number
  globalFifaRank: number | null
  nameVisibility: PoolNameVisibility
  viewerMemberId?: string
  highlight?: boolean
  isYou?: boolean
  awardLine?: string
  right: React.ReactNode
}

export function TeamLeaderboardRow({
  rank,
  teamName,
  fifaCode,
  groupLetter,
  groupPosition,
  managerNames,
  poolMemberIds,
  coManagerCount,
  globalFifaRank,
  nameVisibility,
  viewerMemberId,
  highlight,
  isYou,
  awardLine,
  right,
}: Props) {
  const staff = getTeamStaff(fifaCode)
  const managerLabels = maskManagerNames(managerNames, poolMemberIds, nameVisibility)

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 leaderboard-row-accent ${
        highlight ? 'leaderboard-row-you' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <TeamFlag fifaCode={fifaCode} size={40} title={teamName} />
        <div className="min-w-0">
          <span className="font-medium">
            {teamName} #{rank}
            {isYou && (
              <span className="ml-1 text-xs font-normal text-fifa-green">(you)</span>
            )}
          </span>
          {awardLine && (
            <p className="text-xs text-[var(--muted)]">{awardLine}</p>
          )}
          {groupLetter && (
            <p className="text-xs text-[var(--muted)]">
              Group {groupLetter}
              {groupPosition != null ? ` · #${groupPosition}` : ''}
            </p>
          )}
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {formatPlayerLine(
              managerLabels,
              poolMemberIds,
              coManagerCount,
              nameVisibility,
              viewerMemberId,
            )}
          </p>
          <p className="text-xs text-[var(--muted)]">
            Head coach: {staff.headCoach} · Captain: {staff.captain}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {formatFifaWorldRanking(globalFifaRank)}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">{right}</div>
    </div>
  )
}
