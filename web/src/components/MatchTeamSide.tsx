import { TeamFlag } from '@/components/TeamFlag'
import { formatFifaWorldRanking } from '@/lib/globalRank'
import { getTeamStaff } from '@/lib/teamStaff'

export type MatchTeamSideTeam = {
  name: string
  fifa_code: string
  group_letter: string | null
  global_fifa_rank?: number | null
}

export function MatchTeamSide({
  team,
  align,
  highlight,
  playerLine,
  score,
}: {
  team: MatchTeamSideTeam
  align: 'left' | 'right'
  highlight?: boolean
  playerLine?: string
  score?: number | null
}) {
  const staff = getTeamStaff(team.fifa_code)

  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <TeamFlag fifaCode={team.fifa_code} size={40} title={team.name} />
      <div className="min-w-0">
        <p
          className={`truncate font-semibold leading-tight ${
            highlight ? 'text-[var(--team-primary)]' : 'text-[var(--foreground)]'
          }`}
        >
          {team.name}
        </p>
        {team.group_letter && (
          <p className="text-xs text-[var(--muted)]">Group {team.group_letter}</p>
        )}
        {playerLine && (
          <p className="mt-0.5 text-xs text-[var(--muted)]">{playerLine}</p>
        )}
        <p className="text-xs text-[var(--muted)]">
          Manager: {staff.headCoach} · Captain: {staff.captain}
        </p>
        <p className="text-xs text-[var(--muted)]">
          {formatFifaWorldRanking(team.global_fifa_rank)}
        </p>
      </div>
      {score != null && (
        <span className="shrink-0 text-2xl font-bold tabular-nums text-[var(--foreground)]">
          {score}
        </span>
      )}
    </div>
  )
}
