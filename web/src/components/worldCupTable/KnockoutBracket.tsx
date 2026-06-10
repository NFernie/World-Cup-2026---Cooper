import { TeamFlag } from '@/components/TeamFlag'
import {
  KNOCKOUT_ROUND_ORDER,
  formatKnockoutRound,
  getMatchWinner,
  type BracketSlot,
  type KnockoutRound,
} from '@/lib/worldCupStandings'

type Props = {
  rounds: Map<KnockoutRound, BracketSlot[]>
  highlightTeamId?: string
  filterTeamId?: string
}

function BracketTeam({
  team,
  score,
  isWinner,
  isLoser,
  highlight,
  dimmed,
}: {
  team: { name: string; fifa_code: string } | null
  score: number | null
  isWinner?: boolean
  isLoser?: boolean
  highlight?: boolean
  dimmed?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${
        highlight ? 'bg-[color-mix(in_srgb,var(--team-primary)_14%,transparent)]' : ''
      } ${dimmed ? 'opacity-35' : ''} ${isWinner ? 'font-bold' : ''} ${
        isLoser ? 'text-[var(--muted)]' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {team ? (
          <>
            <TeamFlag fifaCode={team.fifa_code} size={20} className="!h-3 !w-[18px] shrink-0" />
            <span className="truncate text-xs">{team.name}</span>
          </>
        ) : (
          <span className="text-xs italic text-[var(--muted)]">TBD</span>
        )}
      </div>
      {score != null && (
        <span className="shrink-0 text-xs font-bold tabular-nums">{score}</span>
      )}
    </div>
  )
}

function BracketMatchCard({
  slot,
  highlightTeamId,
  filterTeamId,
}: {
  slot: BracketSlot
  highlightTeamId?: string
  filterTeamId?: string
}) {
  const winnerId =
    slot.home && slot.away
      ? getMatchWinner(
          slot.home.id,
          slot.away.id,
          slot.homeScore,
          slot.awayScore,
          slot.status,
        )
      : null

  const homeHighlight = slot.home?.id === highlightTeamId
  const awayHighlight = slot.away?.id === highlightTeamId

  return (
    <div
      className={`w-[168px] shrink-0 rounded-lg border bg-[var(--card)] p-2 ${
        slot.isPlaceholder
          ? 'border-dashed border-[var(--border)]'
          : slot.status === 'live'
            ? 'border-red-400/60'
            : 'border-[var(--border)]'
      }`}
    >
      {slot.status === 'live' && (
        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-red-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          Live
        </p>
      )}
      <BracketTeam
        team={slot.home}
        score={slot.homeScore}
        isWinner={winnerId != null && slot.home?.id === winnerId}
        isLoser={winnerId != null && slot.home?.id !== winnerId}
        highlight={homeHighlight}
        dimmed={Boolean(filterTeamId && slot.home && slot.home.id !== filterTeamId)}
      />
      <div className="my-0.5 border-t border-[var(--border)]" />
      <BracketTeam
        team={slot.away}
        score={slot.awayScore}
        isWinner={winnerId != null && slot.away?.id === winnerId}
        isLoser={winnerId != null && slot.away?.id !== winnerId}
        highlight={awayHighlight}
        dimmed={Boolean(filterTeamId && slot.away && slot.away.id !== filterTeamId)}
      />
    </div>
  )
}

export function KnockoutBracket({ rounds, highlightTeamId, filterTeamId }: Props) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-4">
        {KNOCKOUT_ROUND_ORDER.map((stage) => {
          const slots = rounds.get(stage) ?? []

          return (
            <section key={stage} className="flex shrink-0 flex-col gap-2">
              <h3 className="sticky left-0 text-center text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                {formatKnockoutRound(stage)}
              </h3>
              <div className="flex min-h-[120px] flex-col justify-around gap-2">
                {slots.map((slot) => (
                  <BracketMatchCard
                    key={slot.id}
                    slot={slot}
                    highlightTeamId={highlightTeamId}
                    filterTeamId={filterTeamId}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
