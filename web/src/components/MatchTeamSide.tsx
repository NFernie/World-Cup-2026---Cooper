import { TeamFlag } from '@/components/TeamFlag'
import { formatFifaWorldRanking } from '@/lib/globalRank'
import { getTeamStaff } from '@/lib/teamStaff'

export type MatchTeamSideTeam = {
  name: string
  fifa_code: string
  group_letter: string | null
  global_fifa_rank?: number | null
}

/** Compact row: flag, name, optional score only. */
export function MatchTeamCompact({
  team,
  align,
  highlight,
  score,
}: {
  team: MatchTeamSideTeam
  align: 'left' | 'right'
  highlight?: boolean
  score?: number | null
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <TeamFlag fifaCode={team.fifa_code} size={40} title={team.name} />
      <p
        className={`min-w-0 flex-1 truncate font-semibold leading-tight ${
          highlight ? 'text-[var(--team-primary)]' : 'text-[var(--foreground)]'
        }`}
      >
        {team.name}
      </p>
      {score != null && (
        <span className="shrink-0 text-2xl font-bold tabular-nums text-[var(--foreground)]">
          {score}
        </span>
      )}
    </div>
  )
}

/** Manager, captain, FIFA rank, player line, group — shown in expanded fixture details. */
export function MatchTeamDetails({
  team,
  playerLine,
  align = 'left',
}: {
  team: MatchTeamSideTeam
  playerLine?: string
  align?: 'left' | 'right'
}) {
  const staff = getTeamStaff(team.fifa_code)

  return (
    <div className={`min-w-0 text-xs text-[var(--muted)] ${align === 'right' ? 'text-right' : ''}`}>
      <p className="font-medium text-[var(--foreground)]">{team.name}</p>
      {team.group_letter && <p>Group {team.group_letter}</p>}
      {playerLine && <p>{playerLine}</p>}
      <p>
        Head coach: {staff.headCoach} · Captain: {staff.captain}
      </p>
      <p>{formatFifaWorldRanking(team.global_fifa_rank)}</p>
    </div>
  )
}
