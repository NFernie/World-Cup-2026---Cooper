import { exitRoundLabel } from './exitRounds'
import type { ExitRound, TournamentMatchPreview } from './types'
import { teamTop11AverageRating } from './teamRating'
import type { GameTeam, SquadPlayer } from './types'

export type RatedOpponent = {
  teamId: string
  name: string
  fifaCode: string
  ovr: number
}

const KNOCKOUT_ROUNDS: ExitRound[] = [
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'final',
]

const KNOCKOUT_PERCENTILES = [0.55, 0.7, 0.82, 0.92, 1] as const

/** World Cup 2026 nations with synced squads, excluding the user's drafted teams. */
export function buildOpponentPool(
  teams: GameTeam[],
  squadsByTeam: Map<string, SquadPlayer[]>,
  excludeTeamIds: Set<string>,
): RatedOpponent[] {
  const rated: RatedOpponent[] = []

  for (const team of teams) {
    if (excludeTeamIds.has(team.id)) continue
    const squad = squadsByTeam.get(team.id) ?? []
    const ovr = teamTop11AverageRating(squad)
    if (ovr <= 0) continue
    rated.push({
      teamId: team.id,
      name: team.name,
      fifaCode: team.fifa_code,
      ovr,
    })
  }

  return rated.sort((a, b) => a.ovr - b.ovr)
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickGroupOpponents(
  pool: RatedOpponent[],
  userSquadOvr: number,
  count: number,
  rng: () => number,
): RatedOpponent[] {
  if (pool.length <= count) return shuffle(pool, rng)

  let margin = 8
  let candidates = pool.filter((t) => Math.abs(t.ovr - userSquadOvr) <= margin)
  while (candidates.length < count && margin < 30) {
    margin += 4
    candidates = pool.filter((t) => Math.abs(t.ovr - userSquadOvr) <= margin)
  }
  if (candidates.length < count) candidates = [...pool]

  return shuffle(candidates, rng).slice(0, count)
}

function pickKnockoutOpponents(pool: RatedOpponent[], count: number): RatedOpponent[] {
  if (pool.length === 0) return []
  if (pool.length <= count) return [...pool]

  const sorted = [...pool].sort((a, b) => a.ovr - b.ovr)
  const n = sorted.length
  const used = new Set<string>()
  const picks: RatedOpponent[] = []

  for (let i = 0; i < count; i++) {
    const percentile = KNOCKOUT_PERCENTILES[Math.min(i, KNOCKOUT_PERCENTILES.length - 1)]
    let idx = Math.min(n - 1, Math.max(0, Math.ceil(percentile * n) - 1))
    while (idx < n && used.has(sorted[idx].teamId)) idx++
    if (idx >= n) {
      const fallback = sorted.find((t) => !used.has(t.teamId))
      if (!fallback) break
      picks.push(fallback)
      used.add(fallback.teamId)
      continue
    }
    picks.push(sorted[idx])
    used.add(sorted[idx].teamId)
  }

  return picks
}

export type BuildTournamentScheduleInput = {
  userSquadOvr: number
  teams: GameTeam[]
  squadsByTeam: Map<string, SquadPlayer[]>
  /** Nations already drafted into the user's XI — excluded from opponents. */
  excludeTeamIds: string[]
  rng?: () => number
}

/** Build an 8-match path: 3 group games + 5 knockouts from real WC 2026 squads. */
export function buildTournamentSchedule(
  input: BuildTournamentScheduleInput,
): TournamentMatchPreview[] {
  const rng = input.rng ?? Math.random
  const pool = buildOpponentPool(
    input.teams,
    input.squadsByTeam,
    new Set(input.excludeTeamIds),
  )

  const groupTeams = pickGroupOpponents(pool, input.userSquadOvr, 3, rng)
  const usedIds = new Set(groupTeams.map((t) => t.teamId))
  const remaining = pool.filter((t) => !usedIds.has(t.teamId))
  const knockoutTeams = pickKnockoutOpponents(remaining, KNOCKOUT_ROUNDS.length)

  const group: TournamentMatchPreview[] = groupTeams.map((o, i) => ({
    id: `group-${i + 1}`,
    stage: 'group',
    stageLabel: `Group stage · Match ${i + 1}`,
    opponentName: o.name,
    opponentOvr: o.ovr,
    isKnockout: false,
    groupIndex: i + 1,
  }))

  const knockouts: TournamentMatchPreview[] = KNOCKOUT_ROUNDS.map((round, i) => {
    const opponent = knockoutTeams[i] ?? knockoutTeams[knockoutTeams.length - 1]
    return {
      id: round,
      stage: round,
      stageLabel: exitRoundLabel(round),
      opponentName: opponent?.name ?? 'TBD',
      opponentOvr: opponent?.ovr ?? input.userSquadOvr,
      isKnockout: true,
    }
  })

  return [...group, ...knockouts]
}
