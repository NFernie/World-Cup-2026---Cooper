import type { ReactNode } from 'react'

/** Faint World Cup–themed margin art (70% transparent ≈ 30% opacity). */
export function PoolWorldCupDecor({ children }: { children: ReactNode }) {
  return (
    <div className="pool-wc-decor relative">
      <div className="pool-wc-decor__art pool-wc-decor__art--left" aria-hidden />
      <div className="pool-wc-decor__art pool-wc-decor__art--right" aria-hidden />
      <div className="relative z-[1]">{children}</div>
    </div>
  )
}
