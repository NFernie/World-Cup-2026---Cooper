import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { TeamFlag } from '@/components/TeamFlag'
import { GoalIcon, RedCardIcon, YellowCardIcon } from '@/components/MatchEventIcons'

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

type DisplayEvent = {
  id: string
  kind: 'goal' | 'yellow' | 'red'
  minute: number
  extra: number | null
  player: string
  assist?: string | null
  detail?: string | null
  side: TeamSide
}

export function formatGoalMinute(minute: number, extra: number | null) {
  if (extra != null && extra > 0) return `${minute}+${extra}'`
  return `${minute}'`
}

function eventKind(ev: MatchEventRow): DisplayEvent['kind'] | null {
  if (ev.event_type === 'Goal') return 'goal'
  if (ev.event_type !== 'Card') return null
  if (ev.detail === 'Yellow Card') return 'yellow'
  if (ev.detail === 'Red Card' || ev.detail === 'Second Yellow') return 'red'
  return null
}

function EventIcon({ kind }: { kind: DisplayEvent['kind'] }) {
  if (kind === 'goal') return <GoalIcon />
  if (kind === 'yellow') return <YellowCardIcon />
  return <RedCardIcon />
}

export function MatchEventsDropdown({
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
  const [open, setOpen] = useState(false)

  const displayEvents = useMemo(() => {
    function sideForEvent(ev: MatchEventRow) {
      const isHome = ev.team_api_id != null ? ev.team_api_id === homeApiId : false
      return isHome ? home : away
    }

    const mapped: DisplayEvent[] = []
    for (const ev of events) {
      const kind = eventKind(ev)
      if (!kind) continue
      mapped.push({
        id: ev.id,
        kind,
        minute: ev.minute,
        extra: ev.extra_minute,
        player: ev.player_name,
        assist: ev.assist_name,
        detail: ev.detail,
        side: sideForEvent(ev),
      })
    }
    return mapped.sort(
      (a, b) => a.minute * 100 + (a.extra ?? 0) - (b.minute * 100 + (b.extra ?? 0)),
    )
  }, [events, homeApiId, home, away])

  if (displayEvents.length === 0) return null

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--card)] hover:text-[var(--foreground)]"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Match Events
        <span className="text-[10px] font-normal text-[var(--muted)]">({displayEvents.length})</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5">
          {displayEvents.map((ev) => (
            <li
              key={ev.id}
              className="flex items-center gap-1.5 py-0.5 text-xs leading-tight"
            >
              <EventIcon kind={ev.kind} />
              <span className="w-9 shrink-0 font-mono text-[10px] text-[var(--muted)]">
                {formatGoalMinute(ev.minute, ev.extra)}
              </span>
              <TeamFlag fifaCode={ev.side.fifa_code} size={16} className="!h-2.5 !w-4 shrink-0" />
              <span
                className={`min-w-0 truncate font-medium ${
                  ev.kind === 'red'
                    ? 'text-red-600 dark:text-red-400'
                    : ev.kind === 'yellow'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-[var(--foreground)]'
                }`}
              >
                {ev.player}
              </span>
              {ev.kind === 'goal' && ev.assist && (
                <span className="hidden truncate text-[var(--muted)] sm:inline">
                  ({ev.assist})
                </span>
              )}
              {ev.detail &&
                ev.detail !== 'Normal Goal' &&
                ev.detail !== 'Yellow Card' &&
                ev.detail !== 'Red Card' && (
                  <span className="hidden truncate text-[10px] text-[var(--muted)] sm:inline">
                    · {ev.detail}
                  </span>
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** @deprecated Use MatchEventsDropdown */
export function MatchEventsList(props: Parameters<typeof MatchEventsDropdown>[0]) {
  return <MatchEventsDropdown {...props} />
}
