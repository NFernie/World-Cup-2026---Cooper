import { effectiveRating } from './types'
import type { DraftPick, ExitRound, SimulationResult } from './types'

const EXIT_LABELS: Record<ExitRound, string> = {
  group: 'Group stage',
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter-final',
  semi_final: 'Semi-final',
  final: 'Final',
  champion: 'Champions',
}

export function exitRoundLabel(round: ExitRound): string {
  return EXIT_LABELS[round]
}

/**
 * Position-weighted squad rating using each player's effective rating
 * (out-of-position players take a penalty). Spine weighted slightly higher.
 */
export function squadOverall(picks: DraftPick[]): number {
  if (picks.length === 0) return 0
  let weighted = 0
  let weightTotal = 0
  for (const pick of picks) {
    const weight = pick.slotFamily === 'MID' ? 1 : 1.1
    weighted += effectiveRating(pick) * weight
    weightTotal += weight
  }
  return Math.round(weighted / weightTotal)
}

/**
 * Logistic win probability for a single match given squad OVR vs an implied
 * opponent strength. Higher rounds face stronger opponents.
 */
export function winProbability(squadOvr: number, opponentOvr: number): number {
  const diff = squadOvr - opponentOvr
  return 1 / (1 + Math.pow(10, -diff / 12))
}

export type MatchOutcome = 'win' | 'draw' | 'loss'

export type TournamentMatchPreview = {
  id: string
  stage: ExitRound
  stageLabel: string
  opponentName: string
  opponentOvr: number
  isKnockout: boolean
  groupIndex?: number
}

export type GoalEvent = {
  minute: number
  scorer: string
  team: 'user' | 'opponent'
}

export type PlayedMatch = TournamentMatchPreview & {
  userOvr: number
  outcome: MatchOutcome
  score: { user: number; opponent: number }
  goals: GoalEvent[]
  commentary: string[]
}

const GROUP_OPPONENTS = [
  { name: 'Bolivia', ovr: 70 },
  { name: 'Canada', ovr: 70 },
  { name: 'Qatar', ovr: 70 },
] as const

const KNOCKOUT_OPPONENTS: {
  round: ExitRound
  next: ExitRound
  name: string
  opponentOvr: number
}[] = [
  { round: 'round_of_32', next: 'round_of_16', name: 'Mexico', opponentOvr: 74 },
  { round: 'round_of_16', next: 'quarter_final', name: 'Germany', opponentOvr: 78 },
  { round: 'quarter_final', next: 'semi_final', name: 'Netherlands', opponentOvr: 82 },
  { round: 'semi_final', next: 'final', name: 'Brazil', opponentOvr: 85 },
  { round: 'final', next: 'champion', name: 'Argentina', opponentOvr: 88 },
]

const OPPONENT_SCORERS = [
  'L. Martínez',
  'Álvarez',
  'Fernández',
  'González',
  'Silva',
  'Santos',
  'Kowalski',
  'Müller',
  'Diallo',
]

export function buildTournamentSchedule(): TournamentMatchPreview[] {
  const group: TournamentMatchPreview[] = GROUP_OPPONENTS.map((o, i) => ({
    id: `group-${i + 1}`,
    stage: 'group',
    stageLabel: `Group stage · Match ${i + 1}`,
    opponentName: o.name,
    opponentOvr: o.ovr,
    isKnockout: false,
    groupIndex: i + 1,
  }))

  const knockouts: TournamentMatchPreview[] = KNOCKOUT_OPPONENTS.map((o) => ({
    id: o.round,
    stage: o.round,
    stageLabel: exitRoundLabel(o.round),
    opponentName: o.name,
    opponentOvr: o.opponentOvr,
    isKnockout: true,
  }))

  return [...group, ...knockouts]
}

export function determineMatchOutcome(
  squadOvr: number,
  opponentOvr: number,
  isKnockout: boolean,
  rng: () => number,
): MatchOutcome {
  const pWin = winProbability(squadOvr, opponentOvr)
  if (isKnockout) {
    return rng() < pWin ? 'win' : 'loss'
  }
  const pDraw = 0.22
  const roll = rng()
  if (roll < pWin) return 'win'
  if (roll < pWin + pDraw) return 'draw'
  return 'loss'
}

function pickWeightedScorer(picks: DraftPick[], rng: () => number): string {
  const weights = picks.map((p) => {
    if (p.slotFamily === 'FWD') return 5
    if (p.slotFamily === 'MID') return 3
    if (p.slotFamily === 'DEF') return 1
    return 0.2
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = rng() * total
  for (let i = 0; i < picks.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return picks[i].player.name.split(' ').pop() ?? picks[i].player.name
  }
  return picks[picks.length - 1]?.player.name ?? 'Unknown'
}

function pickOpponentScorer(rng: () => number): string {
  return OPPONENT_SCORERS[Math.floor(rng() * OPPONENT_SCORERS.length)]
}

function generateScore(outcome: MatchOutcome, rng: () => number): { user: number; opponent: number } {
  if (outcome === 'draw') {
    const goals = rng() < 0.45 ? 0 : rng() < 0.75 ? 1 : 2
    return { user: goals, opponent: goals }
  }
  if (outcome === 'win') {
    const user = 1 + Math.floor(rng() * 3)
    const opponent = rng() < 0.55 ? 0 : Math.min(user - 1, Math.floor(rng() * 2))
    return { user, opponent }
  }
  const opponent = 1 + Math.floor(rng() * 3)
  const user = rng() < 0.5 ? 0 : Math.min(opponent - 1, Math.floor(rng() * 2))
  return { user, opponent }
}

function distributeGoals(
  total: number,
  picks: DraftPick[],
  team: 'user' | 'opponent',
  rng: () => number,
): GoalEvent[] {
  const goals: GoalEvent[] = []
  const usedMinutes = new Set<number>()
  for (let i = 0; i < total; i++) {
    let minute = 1 + Math.floor(rng() * 90)
    while (usedMinutes.has(minute)) minute = 1 + Math.floor(rng() * 90)
    usedMinutes.add(minute)
    goals.push({
      minute,
      scorer: team === 'user' ? pickWeightedScorer(picks, rng) : pickOpponentScorer(rng),
      team,
    })
  }
  return goals.sort((a, b) => a.minute - b.minute)
}

const COMMENTARY_OPENERS = [
  'Kicks off!',
  'Early pressure from {user}.',
  '{opponent} settle into shape.',
  'End-to-end stuff in the opening minutes.',
  '{user} win a dangerous free kick.',
  '{opponent} break at pace.',
  'Huge save keeps the score level.',
  'The crowd roars as {user} surge forward.',
  '{opponent} sit deep and soak it up.',
  'Tactical chess — neither side giving an inch.',
]

const COMMENTARY_GOAL = [
  "GOOOAL! {scorer} finishes for {team}!",
  '{scorer} buries it — {team} lead!',
  'What a strike! {scorer} makes it count.',
]

const COMMENTARY_CLOSERS = [
  'Half-time — all to play for.',
  'Second half underway.',
  'Tense final ten minutes.',
  'Full time.',
]

export function buildMatchPresentation(
  preview: TournamentMatchPreview,
  picks: DraftPick[],
  outcome: MatchOutcome,
  rng: () => number = Math.random,
): PlayedMatch {
  const userOvr = squadOverall(picks)
  const score = generateScore(outcome, rng)
  const userGoals = distributeGoals(score.user, picks, 'user', rng)
  const oppGoals = distributeGoals(score.opponent, picks, 'opponent', rng)
  const goals = [...userGoals, ...oppGoals].sort((a, b) => a.minute - b.minute)

  const commentary: string[] = []
  const userLabel = 'Your XI'
  const oppLabel = preview.opponentName

  commentary.push(
    COMMENTARY_OPENERS[0].replace('{user}', userLabel).replace('{opponent}', oppLabel),
  )

  let goalIdx = 0
  for (let minute = 5; minute <= 90; minute += 7 + Math.floor(rng() * 6)) {
    while (goalIdx < goals.length && goals[goalIdx].minute <= minute) {
      const g = goals[goalIdx]
      const teamName = g.team === 'user' ? userLabel : oppLabel
      const line = COMMENTARY_GOAL[Math.floor(rng() * COMMENTARY_GOAL.length)]
        .replace('{scorer}', g.scorer)
        .replace('{team}', teamName)
      commentary.push(`${g.minute}' ${line}`)
      goalIdx++
    }
    if (commentary.length >= 14) break
    const template = COMMENTARY_OPENERS[1 + Math.floor(rng() * (COMMENTARY_OPENERS.length - 1))]
    commentary.push(`${minute}' ${template.replace('{user}', userLabel).replace('{opponent}', oppLabel)}`)
  }

  while (goalIdx < goals.length) {
    const g = goals[goalIdx]
    const teamName = g.team === 'user' ? userLabel : oppLabel
    commentary.push(
      `${g.minute}' ${COMMENTARY_GOAL[0].replace('{scorer}', g.scorer).replace('{team}', teamName)}`,
    )
    goalIdx++
  }

  commentary.push(COMMENTARY_CLOSERS[COMMENTARY_CLOSERS.length - 1])

  return {
    ...preview,
    userOvr,
    outcome,
    score,
    goals,
    commentary,
  }
}

export type TournamentRunResult = SimulationResult & {
  matches: PlayedMatch[]
}

export function simulateTournamentFull(
  picks: DraftPick[],
  rng: () => number = Math.random,
): TournamentRunResult {
  const schedule = buildTournamentSchedule()
  const ovr = squadOverall(picks)
  const matches: PlayedMatch[] = []

  let points = 0
  let wins = 0
  let draws = 0
  let losses = 0

  for (const preview of schedule) {
    if (preview.stage !== 'group') break
    const outcome = determineMatchOutcome(ovr, preview.opponentOvr, false, rng)
    matches.push(buildMatchPresentation(preview, picks, outcome, rng))
    if (outcome === 'win') {
      wins++
      points += 3
    } else if (outcome === 'draw') {
      draws++
      points += 1
    } else {
      losses++
    }
  }

  const groupRecord = `${wins}W-${draws}D-${losses}L`

  if (points < 4) {
    return {
      outcome: 'knocked_out',
      exitRound: 'group',
      squadOvr: ovr,
      groupRecord,
      matches,
    }
  }

  for (const preview of schedule.filter((m) => m.isKnockout)) {
    const outcome = determineMatchOutcome(ovr, preview.opponentOvr, true, rng)
    matches.push(buildMatchPresentation(preview, picks, outcome, rng))
    if (outcome !== 'win') {
      return {
        outcome: 'knocked_out',
        exitRound: preview.stage,
        squadOvr: ovr,
        groupRecord,
        matches,
      }
    }
  }

  return {
    outcome: 'won',
    exitRound: 'champion',
    squadOvr: ovr,
    groupRecord,
    matches,
  }
}

/** @deprecated Use simulateTournamentFull for match detail; kept for lightweight callers. */
export function simulateTournament(
  picks: DraftPick[],
  rng: () => number = Math.random,
): SimulationResult {
  const { matches: _m, ...result } = simulateTournamentFull(picks, rng)
  return result
}
