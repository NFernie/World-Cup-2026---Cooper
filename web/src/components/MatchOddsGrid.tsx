import { formatPoints } from '@/lib/utils'

type Odds = {
  home_win_decimal: number
  draw_decimal: number
  away_win_decimal: number
}

export function MatchOddsGrid({ odds }: { odds: Odds }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
      <div className="rounded-lg bg-[var(--background)] p-2">
        <div className="text-[var(--muted)]">Home</div>
        <div className="font-semibold tabular-nums">{formatPoints(odds.home_win_decimal)}</div>
      </div>
      <div className="rounded-lg bg-[var(--background)] p-2">
        <div className="text-[var(--muted)]">Draw</div>
        <div className="font-semibold tabular-nums">{formatPoints(odds.draw_decimal)}</div>
      </div>
      <div className="rounded-lg bg-[var(--background)] p-2">
        <div className="text-[var(--muted)]">Away</div>
        <div className="font-semibold tabular-nums">{formatPoints(odds.away_win_decimal)}</div>
      </div>
    </div>
  )
}
