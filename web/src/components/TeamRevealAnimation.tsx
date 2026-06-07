import { useEffect, useMemo, useRef, useState } from 'react'
import { getFlagUrl, preloadFlags } from '@/lib/flags'
import { getTeamTheme } from '@/lib/teamColors'

type Team = { fifa_code: string; name: string }

type Props = {
  allTeams: Team[]
  assigned: Team
  /** Remaining nations in the pool sweep (e.g. 38 when 10 members have joined). */
  spinTeamCount?: number
  onComplete: () => void
}

/** ~8s flag carousel, ~5s reveal, then navigate (~13s total). */
const SPIN_TICKS = 52
const REVEAL_MS = 5000

function delayForTick(t: number): number {
  if (t < 18) return 140
  if (t < 32) return 200
  if (t < 44) return 280
  return 380
}

export function TeamRevealAnimation({ allTeams, assigned, spinTeamCount, onComplete }: Props) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<'spin' | 'reveal'>('spin')
  const [imgError, setImgError] = useState(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const teams = useMemo(
    () => (allTeams.length > 0 ? allTeams : [assigned]),
    [allTeams, assigned],
  )
  const codes = useMemo(() => teams.map((t) => t.fifa_code), [teams])
  const assignedIndex = Math.max(0, codes.indexOf(assigned.fifa_code))
  const theme = getTeamTheme(assigned.fifa_code)

  const currentCode =
    phase === 'reveal' ? assigned.fifa_code : (codes[index] ?? assigned.fifa_code)
  const currentName =
    phase === 'reveal'
      ? assigned.name
      : (teams[index]?.name ?? assigned.name)

  useEffect(() => {
    preloadFlags(codes, 160)
    preloadFlags([assigned.fifa_code], 320)
  }, [codes, assigned.fifa_code])

  useEffect(() => {
    setImgError(false)
  }, [currentCode, phase])

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

  const flagSrc = getFlagUrl(
    currentCode,
    phase === 'reveal' ? 320 : 160,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div
        className="w-full max-w-md rounded-2xl border-2 p-8 text-center shadow-2xl"
        style={{
          borderColor: theme.primary,
          background: `linear-gradient(165deg, color-mix(in srgb, ${theme.primary} 35%, #111) 0%, #1a1a1a 100%)`,
        }}
      >
        {phase === 'spin' ? (
          <>
            <p className="text-base font-medium text-white/80">Selecting your nation…</p>
            <div className="flag-carousel relative mx-auto mt-8 flex h-40 w-56 items-center justify-center overflow-hidden rounded-xl border border-white/25 bg-black/50">
              {!imgError && flagSrc ? (
                <img
                  src={flagSrc}
                  alt=""
                  decoding="async"
                  className="block h-32 w-48 rounded-md object-cover object-center team-flag-spin shadow-lg"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex h-32 w-48 items-center justify-center rounded-md bg-white/10 text-3xl font-bold text-white">
                  {currentCode}
                </div>
              )}
            </div>
            <p className="mt-5 text-sm text-white/60">{currentName}</p>
            <p className="mt-1 text-xs text-white/40">
              Spinning through {spinTeamCount ?? codes.length} team
              {(spinTeamCount ?? codes.length) === 1 ? '' : 's'}
            </p>
          </>
        ) : (
          <>
            <p className="text-xl font-bold" style={{ color: theme.primary }}>
              You&apos;ve been assigned
            </p>
            <div className="relative mx-auto mt-6 flex h-44 w-60 items-center justify-center">
              {!imgError && flagSrc ? (
                <img
                  src={flagSrc}
                  alt={assigned.name}
                  decoding="async"
                  className="block h-36 w-56 rounded-lg object-cover object-center shadow-2xl team-flag-reveal"
                  style={{ border: `4px solid ${theme.primary}` }}
                  onError={() => setImgError(true)}
                />
              ) : (
                <div
                  className="flex h-36 w-56 items-center justify-center rounded-lg bg-white/10 text-4xl font-bold text-white team-flag-reveal"
                  style={{ border: `4px solid ${theme.primary}` }}
                >
                  {assigned.fifa_code}
                </div>
              )}
            </div>
            <p className="mt-6 text-3xl font-bold text-white">{assigned.name}</p>
            <p className="mt-2 text-base text-white/70">{assigned.fifa_code}</p>
          </>
        )}
      </div>
    </div>
  )
}
