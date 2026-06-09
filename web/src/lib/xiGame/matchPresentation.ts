export {
  buildMatchPresentation,
  buildTournamentSchedule,
  determineMatchOutcome,
  simulateTournamentFull,
  squadOverall,
  type CommentaryEventType,
  type CommentaryLine,
  type GoalEvent,
  type MatchOutcome,
  type PlayedMatch,
  type TournamentMatchPreview,
  type TournamentRunResult,
} from './simulate'

/** Total playback time for live match commentary. */
export const MATCH_COMMENTARY_MS = 10_000
