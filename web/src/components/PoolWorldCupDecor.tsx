import type { ReactNode } from 'react'
import { staticAsset } from '@/lib/assets'

/** Faint stock imagery on margins (~70% transparent = 30% opacity). */
export function PoolWorldCupDecor({ children }: { children: ReactNode }) {
  return (
    <div className="pool-wc-decor relative">
      <img
        src={staticAsset('decor/wc-stadium-left.jpg')}
        alt=""
        aria-hidden
        className="pool-wc-decor__img pool-wc-decor__img--left"
      />
      <img
        src={staticAsset('decor/wc-trophy-right.jpg')}
        alt=""
        aria-hidden
        className="pool-wc-decor__img pool-wc-decor__img--right"
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  )
}
