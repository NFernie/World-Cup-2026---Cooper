import { TeamFlag } from '@/components/TeamFlag'
import { pitchRows, type Formation, type FormationSlot } from '@/lib/xiGame/formations'
import { placementFit, placementHint } from '@/lib/xiGame/positions'
import { effectiveRating, type DraftPick, type SquadPlayer } from '@/lib/xiGame/types'

export type XiPitchSize = 'compact' | 'share'

type Props = {
  formation: Formation
  picks: DraftPick[]
  size?: XiPitchSize
  showRatings?: boolean
  selectedPlayer?: SquadPlayer | null
  openSlotIds?: Set<string>
  onSlotClick?: (slot: FormationSlot) => void
}

export function XiPitch({
  formation,
  picks,
  size = 'compact',
  showRatings,
  selectedPlayer,
  openSlotIds = new Set(),
  onSlotClick,
}: Props) {
  const rows = pitchRows(formation)
  const bySlot = new Map(picks.map((p) => [p.slotId, p]))
  const share = size === 'share'

  return (
    <div
      className={`rounded-xl bg-[color-mix(in_srgb,var(--fifa-green,#1f7a3d)_10%,var(--background))] ${
        share ? 'space-y-2 p-3' : 'space-y-2 p-3'
      }`}
    >
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={`flex flex-wrap justify-center ${share ? 'gap-1.5' : 'gap-2'}`}
        >
          {row.map((slot) => {
            const pick = bySlot.get(slot.id)
            const isOpen = openSlotIds.has(slot.id)
            const selecting = Boolean(selectedPlayer) && isOpen
            const fit = selectedPlayer ? placementFit(selectedPlayer, slot) : null
            const natural = fit === 'natural'
            const wrongSlot = fit === 'wrong_slot'

            let stateClass = 'border-dashed border-[var(--border)] bg-[var(--card)]/60'
            if (pick) {
              stateClass = 'border-[var(--primary)]/40 bg-[var(--primary)]/5'
            } else if (selecting) {
              stateClass = natural
                ? 'border-fifa-green bg-fifa-green/15 ring-1 ring-fifa-green'
                : wrongSlot
                  ? 'border-amber-500 bg-amber-500/15 ring-1 ring-amber-500'
                  : 'border-fifa-gold bg-fifa-gold/15 ring-1 ring-fifa-gold'
            }

            const slotClass = share
              ? `min-h-[72px] w-[calc(25%-0.45rem)] min-w-0 max-w-[100px] shrink-0 rounded-lg border px-1 py-1.5 text-center`
              : `w-[80px] rounded-lg border px-1 py-1.5 text-center`

            const content = (
              <>
                <span
                  className={`block font-semibold uppercase tracking-wide text-[var(--muted)] ${
                    share ? 'text-[9px]' : 'text-[10px]'
                  }`}
                >
                  {slot.label}
                </span>
                {pick ? (
                  <span className={`mt-0.5 flex flex-col items-center ${share ? 'gap-0.5' : 'gap-0.5'}`}>
                    <TeamFlag
                      fifaCode={pick.team.fifa_code}
                      size={share ? 18 : 16}
                      title={pick.team.name}
                      className={share ? '!h-3 !w-[18px]' : '!h-3 !w-[18px]'}
                    />
                    <span
                      className={`font-medium text-[var(--foreground)] ${
                        share
                          ? 'w-full break-words text-[10px] leading-tight'
                          : 'max-w-[72px] truncate text-[11px]'
                      }`}
                    >
                      {pick.player.name}
                    </span>
                    {showRatings && (
                      <span className={`font-bold tabular-nums ${share ? 'text-[10px]' : 'text-[11px]'}`}>
                        {effectiveRating(pick)}
                        {pick.placementFit === 'wrong_family' && (
                          <span className="text-fifa-gold">*</span>
                        )}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className={`mt-1 block text-[var(--muted)] ${share ? 'text-xs' : 'text-[10px]'}`}>
                    {selecting && fit ? placementHint(fit) : 'Empty'}
                  </span>
                )}
              </>
            )

            return selecting && onSlotClick ? (
              <button
                key={slot.id}
                type="button"
                onClick={() => onSlotClick(slot)}
                className={`transition-colors ${stateClass} ${slotClass}`}
              >
                {content}
              </button>
            ) : (
              <div key={slot.id} className={`${stateClass} ${slotClass}`}>
                {content}
              </div>
            )
          })}
        </div>
      ))}
      {showRatings && picks.some((p) => p.placementFit === 'wrong_family') && (
        <p className={`text-center text-[var(--muted)] ${share ? 'text-xs' : 'text-[10px]'}`}>
          * out of position (−10%)
        </p>
      )}
    </div>
  )
}
