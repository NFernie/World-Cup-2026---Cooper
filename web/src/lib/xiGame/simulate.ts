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

/** Position-weighted squad rating: spine (GK/DEF/FWD) weighted slightly higher. */
export function squadOverall(picks: DraftPick[]): number {
  if (picks.length === 0) return 0
  let weighted = 0
  let weightTotal = 0
  for (const pick of picks) {
    const weight = pick.family === 'MID' ? 1 : 1.1
    weighted += pick.player.overall_rating * weight
    weightTotal += weight
  }
  return Math.round(weighted / weightTotal)
}

/**
 * Logistic win probability for a single match given squad OVR vs an implied
 * opponent strength. Higher rounds face stronger opponents.
 */
function winProbability(squadOvr: number, opponentOvr: number): number {
  const diff = squadOvr - opponentOvr
  return 1 / (1 + Math.pow(10, -diff / 12))
}

// Opponent strength ramps up each knockout round; group games are easier.
const KNOCKOUT_OPPONENTS: { round: ExitRound; next: ExitRound; opponentOvr: number }[] = [
  { round: 'round_of_32', next: 'round_of_16', opponentOvr: 74 },
  { round: 'round_of_16', next: 'quarter_final', opponentOvr: 78 },
  { round: 'quarter_final', next: 'semi_final', opponentOvr: 82 },
  { round: 'semi_final', next: 'final', opponentOvr: 85 },
  { round: 'final', next: 'champion', opponentOvr: 88 },
]

export function simulateTournament(
  picks: DraftPick[],
  rng: () => number = Math.random,
): SimulationResult {
  const ovr = squadOverall(picks)

  // Group stage: 3 matches vs modest opponents; advance with >= 4 points.
  let points = 0
  let wins = 0
  let draws = 0
  let losses = 0
  const groupOpponentOvr = 70
  for (let i = 0; i < 3; i++) {
    const pWin = winProbability(ovr, groupOpponentOvr)
    const pDraw = 0.22
    const roll = rng()
    if (roll < pWin) {
      wins++
      points += 3
    } else if (roll < pWin + pDraw) {
      draws++
      points += 1
    } else {
      losses++
    }
  }
  const groupRecord = `${wins}W-${draws}D-${losses}L`

  if (points < 4) {
    return { outcome: 'knocked_out', exitRound: 'group', squadOvr: ovr, groupRecord }
  }

  // Knockouts: lose any tie → out at that round; win the final → champion.
  for (const stage of KNOCKOUT_OPPONENTS) {
    const pWin = winProbability(ovr, stage.opponentOvr)
    if (rng() > pWin) {
      return { outcome: 'knocked_out', exitRound: stage.round, squadOvr: ovr, groupRecord }
    }
  }

  return { outcome: 'won', exitRound: 'champion', squadOvr: ovr, groupRecord }
}
