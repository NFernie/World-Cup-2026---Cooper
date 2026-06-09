import { getFormation } from '@/lib/xiGame/formations'
import {
  isXiGameBanterMetadata,
  metadataToDraftPicks,
  type XiGameBanterMetadata,
} from '@/lib/xiGame/banterShare'
import { exitRoundLabel } from '@/lib/xiGame/simulate'
import { XiPitch } from '@/components/xiGame/XiPitch'

type Props = {
  metadata: unknown
}

export function BanterXiShare({ metadata }: Props) {
  if (!isXiGameBanterMetadata(metadata)) return null
  return <BanterXiShareCard meta={metadata} />
}

function BanterXiShareCard({ meta }: { meta: XiGameBanterMetadata }) {
  const formation = getFormation(meta.formationId)
  const picks = metadataToDraftPicks(meta)

  const headline =
    meta.outcome === 'won'
      ? '🏆 World Cup XI — Champions!'
      : `World Cup XI — ${exitRoundLabel(meta.exitRound)}`

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-[var(--primary)]/25 bg-[var(--primary)]/5 p-3">
      <p className="text-sm font-semibold text-[var(--foreground)]">{headline}</p>
      <p className="text-xs text-[var(--muted)]">
        {meta.formationName} · Rating {meta.squadOvr} · Group {meta.groupRecord}
      </p>
      <XiPitch formation={formation} picks={picks} size="share" showRatings />
    </div>
  )
}
