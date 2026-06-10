export {
  buildMatchPresentation,
  buildOpponentPool,
  buildTournamentSchedule,
  determineMatchOutcome,
  simulateTournamentFull,
  squadOverall,
  fifaTeamOvr,
  teamAnchoredOvr,
  teamBestXIAverageRating,
  teamSquadAverageRating,
  teamTop11AverageRating,
  type CommentaryEventType,
  type CommentaryLine,
  type GoalEvent,
  type MatchOutcome,
  type PlayedMatch,
  type TournamentRunResult,
} from './simulate'
export type { TournamentMatchPreview } from './types'
export type { BuildTournamentScheduleInput, RatedOpponent } from './tournamentSchedule'

/** Total playback time for live match commentary. */
export const MATCH_COMMENTARY_MS = 10_000
