import { Link } from 'react-router-dom'
import { Dices } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { XiPitch } from '@/components/xiGame/XiPitch'
import { getFormation } from '@/lib/xiGame/formations'
import {
  isXiGameBanterMetadata,
  metadataToDraftPicks,
  type XiGameBanterMetadata,
} from '@/lib/xiGame/banterShare'
import { exitRoundLabel } from '@/lib/xiGame/simulate'

type Props = {
  metadata: unknown
  poolId: string
}

export function BanterXiShare({ metadata, poolId }: Props) {
  if (!isXiGameBanterMetadata(metadata)) return null
  return <BanterXiShareCard meta={metadata} poolId={poolId} />
}

function BanterXiShareCard({ meta, poolId }: { meta: XiGameBanterMetadata; poolId: string }) {
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
      <Button asChild className="mt-2 w-full sm:w-auto">
        <Link to={`/pools/${poolId}/xi-game`}>
          <Dices className="h-4 w-4" /> Have a crack!
        </Link>
      </Button>
    </div>
  )
}
