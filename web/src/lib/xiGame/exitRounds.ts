import type { ExitRound } from './types'

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
