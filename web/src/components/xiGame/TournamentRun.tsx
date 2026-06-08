import { useEffect, useMemo, useState } from 'react'
import { FastForward, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import {
  buildMatchPresentation,
  buildTournamentSchedule,
  determineMatchOutcome,
  MATCH_COMMENTARY_MS,
  simulateTournamentFull,
  squadOverall,
  type PlayedMatch,
  type TournamentMatchPreview,
  type TournamentRunResult,
} from '@/lib/xiGame/matchPresentation'
import type { DraftPick } from '@/lib/xiGame/types'
type SubPhase = 'preview' | 'playing' | 'match_result'

type Props = {
  picks: DraftPick[]
  onComplete: (result: TournamentRunResult) => void
}

function groupPoints(matches: PlayedMatch[]): number {
  let points = 0
  for (const m of matches) {
    if (m.stage !== 'group') continue
    if (m.outcome === 'win') points += 3
    else if (m.outcome === 'draw') points += 1
  }
  return points
}

function remainingSchedule(played: PlayedMatch[]): TournamentMatchPreview[] {
  const all = buildTournamentSchedule()
  const playedIds = new Set(played.map((m) => m.id))
  const points = groupPoints(played)
  const groupDone = played.filter((m) => m.stage === 'group').length >= 3

  return all.filter((m) => {
    if (playedIds.has(m.id)) return false
    if (m.isKnockout && (!groupDone || points < 4)) return false
    return true
  })
}

export function TournamentRun({ picks, onComplete }: Props) {
  const userOvr = useMemo(() => squadOverall(picks), [picks])
  const [played, setPlayed] = useState<PlayedMatch[]>([])
  const [current, setCurrent] = useState<PlayedMatch | null>(null)
  const [subPhase, setSubPhase] = useState<SubPhase>('preview')
  const [commentaryIndex, setCommentaryIndex] = useState(0)

  const nextPreview = remainingSchedule(played)[0] ?? null

  useEffect(() => {
    if (subPhase !== 'playing' || !current) return
    setCommentaryIndex(0)
    const lines = current.commentary.length
    const intervalMs = Math.max(350, Math.floor(MATCH_COMMENTARY_MS / Math.max(lines, 1)))
    const timer = window.setInterval(() => {
      setCommentaryIndex((i) => {
        if (i + 1 >= lines) {
          window.clearInterval(timer)
          setSubPhase('match_result')
          return i
        }
        return i + 1
      })
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [subPhase, current])

  function kickOff() {
    if (!nextPreview) return
    const outcome = determineMatchOutcome(
      userOvr,
      nextPreview.opponentOvr,
      nextPreview.isKnockout,
      Math.random,
    )
    const match = buildMatchPresentation(nextPreview, picks, outcome, Math.random)
    setCurrent(match)
    setSubPhase('playing')
  }

  function skipAll() {
    onComplete(simulateTournamentFull(picks))
  }

  function continueAfterMatch() {
    if (!current) return
    const nextPlayed = [...played, current]
    setPlayed(nextPlayed)
    setCurrent(null)
    setSubPhase('preview')

    if (current.stage === 'group') {
      const groupMatches = nextPlayed.filter((m) => m.stage === 'group')
      if (groupMatches.length >= 3 && groupPoints(nextPlayed) < 4) {
        const ovr = squadOverall(picks)
        onComplete({
          outcome: 'knocked_out',
          exitRound: 'group',
          squadOvr: ovr,
          groupRecord: formatGroupRecord(nextPlayed),
          matches: nextPlayed,
        })
        return
      }
    }

    if (current.isKnockout && current.outcome !== 'win') {
      onComplete({
        outcome: 'knocked_out',
        exitRound: current.stage,
        squadOvr: userOvr,
        groupRecord: formatGroupRecord(nextPlayed),
        matches: nextPlayed,
      })
      return
    }

    const remaining = remainingSchedule(nextPlayed)
    if (remaining.length === 0) {
      onComplete({
        outcome: 'won',
        exitRound: 'champion',
        squadOvr: userOvr,
        groupRecord: formatGroupRecord(nextPlayed),
        matches: nextPlayed,
      })
    }
  }

  if (!nextPreview && played.length === 0) {
    return null
  }

  if (subPhase === 'preview' && nextPreview) {
    return (
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
              {nextPreview.stageLabel}
            </p>
            <CardTitle className="mt-1 text-xl">Your XI vs {nextPreview.opponentName}</CardTitle>
            <CardDescription className="mt-2">
              Squad rating <strong>{userOvr}</strong> vs opponent{' '}
              <strong>{nextPreview.opponentOvr}</strong>
              {nextPreview.isKnockout ? ' · Win or go home' : ' · Group points on the line'}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={skipAll}>
            <FastForward className="h-4 w-4" /> Skip all matches
          </Button>
        </div>
        {played.length > 0 && (
          <p className="text-xs text-[var(--muted)]">
            Group so far: {formatGroupRecord(played)}
          </p>
        )}
        <Button onClick={kickOff} className="w-full sm:w-auto">
          <Play className="h-4 w-4" /> Kick off
        </Button>
      </Card>
    )
  }

  if (subPhase === 'playing' && current) {
    const visible = current.commentary.slice(0, commentaryIndex + 1)
    return (
      <Card className="space-y-3 p-5">
        <CardTitle className="text-lg">
          {current.stageLabel} — Your XI vs {current.opponentName}
        </CardTitle>
        <p className="text-sm text-[var(--muted)]">
          Rating {current.userOvr} vs {current.opponentOvr}
        </p>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs leading-relaxed">
          {visible.map((line, i) => (
            <p key={i} className={line.includes('GOOOAL') ? 'font-bold text-[var(--primary)]' : ''}>
              {line}
            </p>
          ))}
        </div>
      </Card>
    )
  }

  if (subPhase === 'match_result' && current) {
    const won = current.outcome === 'win'
    const drew = current.outcome === 'draw'
    return (
      <Card className="space-y-4 p-5 text-center">
        <CardTitle className="text-xl">
          {won ? 'Victory!' : drew ? 'Draw' : 'Defeat'}
        </CardTitle>
        <p className="text-3xl font-bold tabular-nums">
          {current.score.user} – {current.score.opponent}
        </p>
        <p className="text-sm text-[var(--muted)]">
          Your XI vs {current.opponentName}
        </p>
        {current.goals.length > 0 && (
          <ul className="mx-auto max-w-sm space-y-1 text-left text-xs text-[var(--muted)]">
            {current.goals.map((g, i) => (
              <li key={i}>
                {g.minute}&apos; {g.scorer} ({g.team === 'user' ? 'You' : current.opponentName})
              </li>
            ))}
          </ul>
        )}
        <Button onClick={continueAfterMatch} className="w-full sm:w-auto">
          {remainingSchedule([...played, current]).length === 0 &&
          (current.isKnockout && current.outcome === 'win')
            ? 'See final result'
            : 'Next match'}
        </Button>
      </Card>
    )
  }

  return null
}

function formatGroupRecord(matches: PlayedMatch[]): string {
  let w = 0
  let d = 0
  let l = 0
  for (const m of matches) {
    if (m.stage !== 'group') continue
    if (m.outcome === 'win') w++
    else if (m.outcome === 'draw') d++
    else l++
  }
  return `${w}W-${d}D-${l}L`
}
