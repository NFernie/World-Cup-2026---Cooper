import { useEffect, useMemo, useRef, useState } from 'react'
import { getFlagUrl } from '@/lib/flags'
import { getTeamTheme } from '@/lib/teamColors'

type Team = { fifa_code: string; name: string }

type Props = {
  allTeams: Team[]
  assigned: Team
  onComplete: () => void
}

/** Spin ~2.6s through flags, reveal assigned nation ~1.4s, then onComplete (~4s total). */
const SPIN_TICKS = 36
const REVEAL_MS = 1400

export function TeamRevealAnimation({ allTeams, assigned, onComplete }: Props) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<'spin' | 'reveal'>('spin')
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const teams = useMemo(
    () => (allTeams.length > 0 ? allTeams : [assigned]),
    [allTeams, assigned],
  )
  const codes = useMemo(() => teams.map((t) => t.fifa_code), [teams])
  const assignedIndex = Math.max(0, codes.indexOf(assigned.fifa_code))
  const theme = getTeamTheme(assigned.fifa_code)

  useEffect(() => {
    document.documentElement.style.setProperty('--team-primary', theme.primary)
    document.documentElement.style.setProperty('--team-secondary', theme.secondary)
    return () => {
      document.documentElement.style.removeProperty('--team-primary')
      document.documentElement.style.removeProperty('--team-secondary')
    }
  }, [theme.primary, theme.secondary])

  useEffect(() => {
    if (codes.length === 0) {
      setPhase('reveal')
      const id = window.setTimeout(() => onCompleteRef.current(), REVEAL_MS)
      return () => window.clearTimeout(id)
    }

    let cancelled = false
    let tick = 0
    let timeoutId = 0

    const delayForTick = (t: number) => {
      if (t < 24) return 72
      if (t < 32) return 110
      return 180
    }

    const runTick = () => {
      if (cancelled) return
      tick += 1

      if (tick < SPIN_TICKS) {
        setIndex((i) => (i + 1) % codes.length)
        timeoutId = window.setTimeout(runTick, delayForTick(tick))
        return
      }

      setIndex(assignedIndex)
      setPhase('reveal')
      timeoutId = window.setTimeout(() => {
        if (!cancelled) onCompleteRef.current()
      }, REVEAL_MS)
    }

    timeoutId = window.setTimeout(runTick, delayForTick(0))

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [codes.length, assignedIndex])

  const currentCode =
    phase === 'reveal' ? assigned.fifa_code : (codes[index] ?? assigned.fifa_code)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div
        className="w-full max-w-sm rounded-2xl border-2 p-8 text-center shadow-2xl"
        style={{
          borderColor: theme.primary,
          background: `linear-gradient(165deg, color-mix(in srgb, ${theme.primary} 35%, #111) 0%, #1a1a1a 100%)`,
        }}
      >
        {phase === 'spin' ? (
          <>
            <p className="text-sm font-medium text-white/70">Selecting your nation…</p>
            <div className="flag-carousel mx-auto mt-6 flex h-32 w-44 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-black/40">
              <img
                key={`${currentCode}-${index}`}
                src={getFlagUrl(currentCode, 180)}
                alt=""
                className="h-24 w-36 rounded-md object-cover team-flag-spin shadow-lg"
              />
            </div>
            <p className="mt-4 text-xs text-white/50">Spinning through {codes.length} teams</p>
          </>
        ) : (
          <>
            <p className="text-lg font-bold" style={{ color: theme.primary }}>
              You&apos;ve been assigned
            </p>
            <img
              src={getFlagUrl(assigned.fifa_code, 220)}
              alt={assigned.name}
              className="mx-auto mt-5 h-28 w-44 rounded-lg object-cover shadow-2xl team-flag-reveal"
              style={{ border: `3px solid ${theme.primary}` }}
            />
            <p className="mt-5 text-2xl font-bold text-white">{assigned.name}</p>
            <p className="text-sm text-white/60">{assigned.fifa_code}</p>
          </>
        )}
      </div>
    </div>
  )
}
