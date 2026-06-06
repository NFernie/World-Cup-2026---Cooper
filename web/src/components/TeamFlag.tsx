import { getFlagUrl } from '@/lib/flags'
import { cn } from '@/lib/utils'

type TeamFlagProps = {
  fifaCode: string
  size?: number
  className?: string
  title?: string
}

export function TeamFlag({ fifaCode, size = 40, className, title }: TeamFlagProps) {
  const src = getFlagUrl(fifaCode, size)
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      title={title}
      loading="lazy"
      className={cn('inline-block shrink-0 rounded-sm object-cover shadow-sm', className)}
      style={{ width: Math.round(size * 1.5), height: Math.round(size * 0.75) }}
    />
  )
}
