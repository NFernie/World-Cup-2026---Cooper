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
        share ? 'space-y-3 p-4' : 'space-y-2 p-3'
      }`}
    >
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={`flex flex-wrap justify-center ${share ? 'gap-2.5 sm:gap-3' : 'gap-2'}`}
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
              ? `min-h-[88px] w-[calc(50%-0.375rem)] min-w-[120px] max-w-[168px] rounded-lg border px-2 py-2 text-center sm:w-[calc(33.333%-0.75rem)] sm:min-w-[128px]`
              : `w-[80px] rounded-lg border px-1 py-1.5 text-center`

            const content = (
              <>
                <span
                  className={`block font-semibold uppercase tracking-wide text-[var(--muted)] ${
                    share ? 'text-[11px]' : 'text-[10px]'
                  }`}
                >
                  {slot.label}
                </span>
                {pick ? (
                  <span className={`mt-1 flex flex-col items-center gap-1 ${share ? '' : 'gap-0.5'}`}>
                    <TeamFlag
                      fifaCode={pick.team.fifa_code}
                      size={share ? 24 : 16}
                      title={pick.team.name}
                      className={share ? '!h-4 !w-6' : '!h-3 !w-[18px]'}
                    />
                    <span
                      className={`font-medium leading-snug text-[var(--foreground)] ${
                        share
                          ? 'w-full break-words text-xs sm:text-sm'
                          : 'max-w-[72px] truncate text-[11px]'
                      }`}
                    >
                      {pick.player.name}
                    </span>
                    {showRatings && (
                      <span className={`font-bold tabular-nums ${share ? 'text-sm' : 'text-[11px]'}`}>
                        {effectiveRating(pick)}
                        {pick.placementFit !== 'natural' && (
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
      {showRatings && picks.some((p) => p.placementFit !== 'natural') && (
        <p className={`text-center text-[var(--muted)] ${share ? 'text-xs' : 'text-[10px]'}`}>
          * wrong role (−5%) or wrong area (−10%)
        </p>
      )}
    </div>
  )
}
