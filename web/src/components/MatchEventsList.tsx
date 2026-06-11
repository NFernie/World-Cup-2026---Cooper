import { TeamFlag } from '@/components/TeamFlag'

export type MatchEventRow = {
  id: string
  match_id: string
  minute: number
  extra_minute: number | null
  player_name: string
  assist_name: string | null
  event_type: string
  detail: string | null
  team_api_id: number | null
}

type TeamSide = {
  fifa_code: string
  name: string
}

export function formatGoalMinute(minute: number, extra: number | null) {
  if (extra != null && extra > 0) return `${minute}+${extra}'`
  return `${minute}'`
}

export function MatchEventsList({
  events,
  homeApiId,
  home,
  away,
}: {
  events: MatchEventRow[]
  homeApiId: number | null
  home: TeamSide
  away: TeamSide
}) {
  const goals = events.filter((e) => e.event_type === 'Goal')
  const redCards = events.filter(
    (e) => e.event_type === 'Card' && (e.detail === 'Red Card' || e.detail === 'Second Yellow'),
  )

  if (goals.length === 0 && redCards.length === 0) return null

  function sideForEvent(ev: MatchEventRow) {
    const isHome = ev.team_api_id != null ? ev.team_api_id === homeApiId : false
    return isHome ? home : away
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      {goals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Goal scorers
          </p>
          <ul className="space-y-1 text-sm">
            {goals.map((ev) => {
              const side = sideForEvent(ev)
              return (
                <li key={ev.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {formatGoalMinute(ev.minute, ev.extra_minute)}
                  </span>
                  <TeamFlag fifaCode={side.fifa_code} size={20} className="!h-3 !w-[18px]" />
                  <span className="font-medium">{ev.player_name}</span>
                  {ev.assist_name && (
                    <span className="text-[var(--muted)]">({ev.assist_name})</span>
                  )}
                  {ev.detail && ev.detail !== 'Normal Goal' && (
                    <span className="text-xs text-[var(--muted)]">· {ev.detail}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {redCards.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Red cards
          </p>
          <ul className="space-y-1 text-sm">
            {redCards.map((ev) => {
              const side = sideForEvent(ev)
              return (
                <li key={ev.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {formatGoalMinute(ev.minute, ev.extra_minute)}
                  </span>
                  <TeamFlag fifaCode={side.fifa_code} size={20} className="!h-3 !w-[18px]" />
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {ev.player_name}
                  </span>
                  {ev.detail && ev.detail !== 'Red Card' && (
                    <span className="text-xs text-[var(--muted)]">· {ev.detail}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
