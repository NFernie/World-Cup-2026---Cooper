import { TeamFlag } from '@/components/TeamFlag'
import type { GroupStanding } from '@/lib/worldCupStandings'

type Props = {
  standingsByGroup: Map<string, GroupStanding[]>
  visibleGroups: string[]
  highlightTeamId?: string
  filterTeamId?: string
}

export function GroupStandingsGrid({
  standingsByGroup,
  visibleGroups,
  highlightTeamId,
  filterTeamId,
}: Props) {
  if (visibleGroups.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">No groups match your filters.</p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visibleGroups.map((letter) => {
        const rows = standingsByGroup.get(letter) ?? []
        return (
          <div
            key={letter}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
          >
            <div className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))] px-3 py-2">
              <h3 className="text-sm font-bold tracking-wide text-[var(--foreground)]">
                Group {letter}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[280px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Team</th>
                    <th className="px-2 py-2 text-center font-medium">P</th>
                    <th className="px-2 py-2 text-center font-medium">W</th>
                    <th className="px-2 py-2 text-center font-medium">D</th>
                    <th className="px-2 py-2 text-center font-medium">L</th>
                    <th className="px-2 py-2 text-center font-medium">GD</th>
                    <th className="px-2 py-2 text-center font-medium">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const isHighlight =
                      row.team.id === highlightTeamId || row.team.id === filterTeamId
                    const dimmed = filterTeamId && row.team.id !== filterTeamId
                    return (
                      <tr
                        key={row.team.id}
                        className={`border-b border-[var(--border)] last:border-b-0 ${
                          isHighlight
                            ? 'bg-[color-mix(in_srgb,var(--team-primary)_12%,var(--card))] shadow-[inset_3px_0_0_var(--team-primary)]'
                            : ''
                        } ${dimmed ? 'opacity-40' : ''}`}
                      >
                        <td className="px-2 py-2 tabular-nums text-[var(--muted)]">
                          {index + 1}
                          {row.qualified && (
                            <span
                              className="ml-1 text-[10px] font-bold uppercase text-[var(--primary)]"
                              title="Qualified for knockout"
                            >
                              Q
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <TeamFlag
                              fifaCode={row.team.fifa_code}
                              size={24}
                              className="!h-3.5 !w-5 shrink-0"
                            />
                            <span className="truncate font-medium text-[var(--foreground)]">
                              {row.team.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums">{row.played}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{row.won}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{row.drawn}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{row.lost}</td>
                        <td
                          className={`px-2 py-2 text-center tabular-nums ${
                            row.goalDifference > 0
                              ? 'text-[var(--primary)]'
                              : row.goalDifference < 0
                                ? 'text-red-500'
                                : ''
                          }`}
                        >
                          {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                        </td>
                        <td className="px-2 py-2 text-center font-bold tabular-nums">
                          {row.points}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
