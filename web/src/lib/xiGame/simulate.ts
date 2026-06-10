export { exitRoundLabel } from './exitRounds'
export { buildTournamentSchedule, buildOpponentPool } from './tournamentSchedule'
export type { BuildTournamentScheduleInput, RatedOpponent } from './tournamentSchedule'
export {
  fifaTeamOvr,
  teamAnchoredOvr,
  teamSquadAverageRating,
  teamBestXIAverageRating,
  teamTop11AverageRating,
} from './teamRating'
import { effectiveRating } from './types'
import type { DraftPick, SimulationResult, TournamentMatchPreview } from './types'

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

export type { TournamentMatchPreview } from './types'

export type GoalEvent = {
  minute: number
  scorer: string
  team: 'user' | 'opponent'
}

export type CommentaryEventType =
  | 'kickoff'
  | 'chance'
  | 'foul'
  | 'free_kick'
  | 'corner'
  | 'yellow_card'
  | 'penalty_awarded'
  | 'penalty_saved'
  | 'goal'
  | 'halftime'
  | 'fulltime'

export type CommentaryLine = {
  minute: number
  type: CommentaryEventType
  text: string
  scorer?: string
  team?: 'user' | 'opponent'
  teamLabel?: string
}

export type PlayedMatch = TournamentMatchPreview & {
  userOvr: number
  outcome: MatchOutcome
  score: { user: number; opponent: number }
  goals: GoalEvent[]
  commentary: CommentaryLine[]
}

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

const COMMENTARY_CHANCE = [
  '{user} carve out a half-chance.',
  '{opponent} probe down the right.',
  'Shot from distance — comfortably wide.',
  '{user} win a corner but nothing comes of it.',
  'Brilliant run — final ball just evades the striker.',
  '{opponent} hit the woodwork! Still level.',
  'Keeper spills it — cleared off the line!',
  '{user} string passes together in the final third.',
]

const COMMENTARY_FOUL = [
  'Late challenge — free kick to {team}.',
  'Referee blows for a foul on {team}.',
  'Scrappy midfield battle — play stopped.',
  '{team} win a soft free kick wide.',
]

const COMMENTARY_FREE_KICK = [
  'Dangerous free kick for {team}… whipped in and cleared.',
  '{team} line up a set piece — headed away.',
  'Free kick floated in — the defence deals with it.',
]

const COMMENTARY_CORNER = [
  'Corner for {team} — headed clear at the near post.',
  '{team} swing one in from the corner flag.',
]

const COMMENTARY_YELLOW = [
  'Yellow card shown — {team} need to calm down.',
  'Booking for a cynical foul by {team}.',
]

const COMMENTARY_PENALTY_AWARDED = [
  'PENALTY! The referee points to the spot for {team}!',
  'VAR check… penalty confirmed for {team}!',
  'Handball in the box — {team} awarded a penalty!',
]

const COMMENTARY_PENALTY_SAVED = [
  'Saved! The keeper denies {team} from the spot!',
  'Penalty struck — brilliant save!',
]

const COMMENTARY_GOAL = [
  'GOOOOOOAL! {scorer} scores for {team}!',
  'The crowd goes wild! {scorer} finds the net for {team}!',
  'GOOOAL! What a finish from {scorer} — {team} are on the scoresheet!',
  '{scorer} buries it! {team} erupt!',
  'Back of the net! {scorer} makes no mistake for {team}!',
  'Sensational strike! {scorer} wheels away in celebration for {team}!',
]

const COMMENTARY_HALFTIME = [
  'Half-time whistle — all to play for.',
  'Interval — managers will have plenty to say.',
]

const COMMENTARY_SECOND_HALF = [
  'Second half underway.',
  'We\'re back for the second 45.',
]

const COMMENTARY_LATE = [
  'Tense final ten minutes.',
  'Stoppage time approaching — everything on the line.',
  'The crowd are on their feet.',
]

function pickTemplate(templates: string[], rng: () => number): string {
  return templates[Math.floor(rng() * templates.length)]
}

function fillLabels(
  template: string,
  userLabel: string,
  oppLabel: string,
  team?: 'user' | 'opponent',
): string {
  const teamLabel = team === 'user' ? userLabel : team === 'opponent' ? oppLabel : ''
  return template
    .replaceAll('{user}', userLabel)
    .replaceAll('{opponent}', oppLabel)
    .replaceAll('{team}', teamLabel)
}

function goalCommentaryLine(
  g: GoalEvent,
  userLabel: string,
  oppLabel: string,
  rng: () => number,
): CommentaryLine {
  const teamLabel = g.team === 'user' ? userLabel : oppLabel
  const template = pickTemplate(COMMENTARY_GOAL, rng)
  return {
    minute: g.minute,
    type: 'goal',
    text: template.replace('{scorer}', g.scorer).replace('{team}', teamLabel),
    scorer: g.scorer,
    team: g.team,
    teamLabel,
  }
}

function buildFillerEvent(
  minute: number,
  userLabel: string,
  oppLabel: string,
  rng: () => number,
): CommentaryLine {
  const roll = rng()
  const side: 'user' | 'opponent' = rng() < 0.5 ? 'user' : 'opponent'

  if (roll < 0.14) {
    return {
      minute,
      type: 'foul',
      text: fillLabels(pickTemplate(COMMENTARY_FOUL, rng), userLabel, oppLabel, side),
    }
  }
  if (roll < 0.22) {
    return {
      minute,
      type: 'free_kick',
      text: fillLabels(pickTemplate(COMMENTARY_FREE_KICK, rng), userLabel, oppLabel, side),
    }
  }
  if (roll < 0.28) {
    return {
      minute,
      type: 'corner',
      text: fillLabels(pickTemplate(COMMENTARY_CORNER, rng), userLabel, oppLabel, side),
    }
  }
  if (roll < 0.33) {
    return {
      minute,
      type: 'yellow_card',
      text: fillLabels(pickTemplate(COMMENTARY_YELLOW, rng), userLabel, oppLabel, side),
    }
  }
  if (roll < 0.38) {
    const penaltySide: 'user' | 'opponent' = rng() < 0.5 ? 'user' : 'opponent'
    if (rng() < 0.35) {
      return {
        minute,
        type: 'penalty_saved',
        text: fillLabels(
          pickTemplate(COMMENTARY_PENALTY_SAVED, rng),
          userLabel,
          oppLabel,
          penaltySide,
        ),
      }
    }
    return {
      minute,
      type: 'penalty_awarded',
      text: fillLabels(
        pickTemplate(COMMENTARY_PENALTY_AWARDED, rng),
        userLabel,
        oppLabel,
        penaltySide,
      ),
    }
  }

  return {
    minute,
    type: 'chance',
    text: fillLabels(pickTemplate(COMMENTARY_CHANCE, rng), userLabel, oppLabel),
  }
}

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

  const commentary: CommentaryLine[] = []
  const userLabel = 'Your XI'
  const oppLabel = preview.opponentName

  commentary.push({
    minute: 0,
    type: 'kickoff',
    text: `Kicks off! ${userLabel} vs ${oppLabel}.`,
  })

  const eventMinutes = new Set<number>()
  for (let m = 4; m <= 88; m += 4 + Math.floor(rng() * 5)) {
    eventMinutes.add(m)
  }
  for (const g of goals) eventMinutes.add(g.minute)
  eventMinutes.add(45)
  eventMinutes.add(46)
  eventMinutes.add(85)
  eventMinutes.add(90)

  const sortedMinutes = [...eventMinutes].sort((a, b) => a - b)
  let goalIdx = 0

  for (const minute of sortedMinutes) {
    while (goalIdx < goals.length && goals[goalIdx].minute <= minute) {
      commentary.push(goalCommentaryLine(goals[goalIdx], userLabel, oppLabel, rng))
      goalIdx++
    }

    if (minute === 45) {
      commentary.push({
        minute: 45,
        type: 'halftime',
        text: pickTemplate(COMMENTARY_HALFTIME, rng),
      })
      continue
    }
    if (minute === 46) {
      commentary.push({
        minute: 46,
        type: 'kickoff',
        text: pickTemplate(COMMENTARY_SECOND_HALF, rng),
      })
      continue
    }
    if (minute === 85) {
      commentary.push({
        minute: 85,
        type: 'chance',
        text: pickTemplate(COMMENTARY_LATE, rng),
      })
      continue
    }
    if (minute === 90) continue

    commentary.push(buildFillerEvent(minute, userLabel, oppLabel, rng))
  }

  while (goalIdx < goals.length) {
    commentary.push(goalCommentaryLine(goals[goalIdx], userLabel, oppLabel, rng))
    goalIdx++
  }

  commentary.push({
    minute: 90,
    type: 'fulltime',
    text: `Full time — ${userLabel} ${score.user}, ${oppLabel} ${score.opponent}.`,
  })

  commentary.sort((a, b) => a.minute - b.minute || (a.type === 'goal' ? 1 : 0))

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
  schedule: TournamentMatchPreview[],
  rng: () => number = Math.random,
): TournamentRunResult {
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
  schedule: TournamentMatchPreview[],
  rng: () => number = Math.random,
): SimulationResult {
  const { matches: _m, ...result } = simulateTournamentFull(picks, schedule, rng)
  return result
}
