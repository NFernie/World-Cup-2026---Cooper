import { formatFormBoostLabel } from '@/lib/xiGame/formBoost'
import type { SquadPlayer } from '@/lib/xiGame/types'

type Props = {
  player: SquadPlayer
  className?: string
}

function sourceLabel(source: string | null | undefined): string {
  if (!source) return 'baseline'
  return source.replace(/_2025$/, '').replace(/_/g, ' ')
}

/** OVR badge with tooltip: base, source, form match rating, form %. */
export function PlayerRatingBadge({ player, className = '' }: Props) {
  const stored = player.stored_rating ?? player.overall_rating
  const boost = player.form_boost_pct ?? 0
  const boostLabel = formatFormBoostLabel(boost)
  const hasForm = boost !== 0 || player.form_match_rating != null

  const lines = [
    `Base ${stored}${player.rating_source ? ` (${sourceLabel(player.rating_source)})` : ''}`,
  ]
  if (player.form_match_rating != null) {
    lines.push(`Last match ${player.form_match_rating.toFixed(1)}`)
  }
  if (boostLabel) {
    lines.push(`Form ${boostLabel} on raw`)
  }
  lines.push(`Adjusted OVR ${player.overall_rating}`)

  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${className}`}
      title={lines.join(' · ')}
    >
      <span className="font-bold">{player.overall_rating}</span>
      {hasForm && boostLabel && (
        <span
          className={`text-[10px] font-semibold ${
            boost > 0 ? 'text-fifa-green' : boost < 0 ? 'text-red-500' : 'text-[var(--muted)]'
          }`}
        >
          {boost > 0 ? '↗' : boost < 0 ? '↘' : ''}
          {boostLabel}
        </span>
      )}
    </span>
  )
}
