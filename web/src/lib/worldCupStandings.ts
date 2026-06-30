import { formatStage } from '@/lib/poolBoards'

export type TeamInfo = {
  id: string
  name: string
  fifa_code: string
  group_letter: string | null
}

export type GroupStanding = {
  team: TeamInfo
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  /** Top two in a completed group are marked qualified for knockout. */
  qualified: boolean
}

export type GroupMatch = {
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  status: string
  stage: string
}

export type KnockoutMatch = GroupMatch & {
  id: string
  kickoff_at: string
  home: TeamInfo
  away: TeamInfo
  winner_team_id?: string | null
  api_status_short?: string | null
}

export type BracketSlot = {
  id: string
  home: TeamInfo | null
  away: TeamInfo | null
  homeScore: number | null
  awayScore: number | null
  status: string
  kickoff_at: string | null
  isPlaceholder: boolean
  winnerTeamId?: string | null
  apiStatusShort?: string | null
}

export const GROUP_LETTERS = 'ABCDEFGHIJKL'.split('')

export const KNOCKOUT_ROUND_ORDER = [
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
] as const

export type KnockoutRound = (typeof KNOCKOUT_ROUND_ORDER)[number]

export const KNOCKOUT_MATCH_COUNTS: Record<KnockoutRound, number> = {
  round_of_32: 16,
  round_of_16: 8,
  quarter_final: 4,
  semi_final: 2,
  third_place: 1,
  final: 1,
}

function compareStandings(a: GroupStanding, b: GroupStanding): number {
  if (b.points !== a.points) return b.points - a.points
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
  return a.team.name.localeCompare(b.team.name)
}

export function isGroupStageComplete(
  groupLetter: string,
  matches: GroupMatch[],
  teams: TeamInfo[],
): boolean {
  const teamIds = new Set(
    teams.filter((t) => t.group_letter === groupLetter).map((t) => t.id),
  )
  if (teamIds.size === 0) return false

  const groupMatches = matches.filter(
    (m) =>
      m.stage === 'group' &&
      teamIds.has(m.home_team_id) &&
      teamIds.has(m.away_team_id),
  )

  const expectedMatches = (teamIds.size * (teamIds.size - 1)) / 2
  if (groupMatches.length < expectedMatches) return false

  return groupMatches.every(
    (m) => m.status === 'finished' && m.home_score != null && m.away_score != null,
  )
}

function remainingGroupGames(
  teamId: string,
  teamIds: Set<string>,
  matches: GroupMatch[],
): number {
  return matches.filter(
    (m) =>
      m.stage === 'group' &&
      m.status !== 'finished' &&
      teamIds.has(m.home_team_id) &&
      teamIds.has(m.away_team_id) &&
      (m.home_team_id === teamId || m.away_team_id === teamId),
  ).length
}

/** True when a team is guaranteed a top-two finish in its group. */
export function hasClinchedTopTwo(
  teamId: string,
  groupStandings: GroupStanding[],
  groupMatches: GroupMatch[],
): boolean {
  const sorted = [...groupStandings].sort(compareStandings)
  const idx = sorted.findIndex((s) => s.team.id === teamId)
  if (idx < 0 || idx > 1) return false

  const ours = sorted[idx]
  const teamIds = new Set(groupStandings.map((s) => s.team.id))

  let rivalsCanPass = 0
  for (const rival of sorted) {
    if (rival.team.id === teamId) continue
    const rivalMax = rival.points + 3 * remainingGroupGames(rival.team.id, teamIds, groupMatches)
    if (
      rivalMax > ours.points ||
      (rivalMax === ours.points && compareStandings(rival, ours) < 0)
    ) {
      rivalsCanPass++
    }
  }

  return rivalsCanPass < 2
}

/** True when a team cannot finish in the top two of its group. */
export function isEliminatedFromTopTwo(
  teamId: string,
  groupStandings: GroupStanding[],
  groupMatches: GroupMatch[],
): boolean {
  if (hasClinchedTopTwo(teamId, groupStandings, groupMatches)) return false

  const sorted = [...groupStandings].sort(compareStandings)
  const ours = sorted.find((s) => s.team.id === teamId)
  if (!ours) return false

  const teamIds = new Set(groupStandings.map((s) => s.team.id))
  const ourMax = ours.points + 3 * remainingGroupGames(teamId, teamIds, groupMatches)

  let teamsCanFinishAhead = 0
  for (const rival of sorted) {
    if (rival.team.id === teamId) continue
    if (rival.points > ourMax) {
      teamsCanFinishAhead++
      continue
    }
    const rivalMax = rival.points + 3 * remainingGroupGames(rival.team.id, teamIds, groupMatches)
    if (rivalMax > ourMax) {
      teamsCanFinishAhead++
    } else if (rivalMax === ourMax && compareStandings(rival, ours) < 0) {
      teamsCanFinishAhead++
    }
  }

  return teamsCanFinishAhead >= 2
}

export const TBD_TEAM: TeamInfo = {
  id: 'tbd',
  name: 'TBD',
  fifa_code: 'TBD',
  group_letter: null,
}

export function isKnockoutStage(stage: string): stage is KnockoutRound {
  return (KNOCKOUT_ROUND_ORDER as readonly string[]).includes(stage)
}

export function collectQualifiedTeams(
  standingsByGroup: Map<string, GroupStanding[]>,
): TeamInfo[] {
  const teams: TeamInfo[] = []
  for (const letter of GROUP_LETTERS) {
    for (const row of standingsByGroup.get(letter) ?? []) {
      if (row.qualified) teams.push(row.team)
    }
  }
  return teams.sort(
    (a, b) =>
      (a.group_letter ?? '').localeCompare(b.group_letter ?? '') ||
      a.name.localeCompare(b.name),
  )
}

export function computeGroupStandings(
  teams: TeamInfo[],
  matches: GroupMatch[],
): Map<string, GroupStanding[]> {
  const byGroup = new Map<string, Map<string, GroupStanding>>()

  for (const team of teams) {
    if (!team.group_letter) continue
    const groupMap = byGroup.get(team.group_letter) ?? new Map<string, GroupStanding>()
    groupMap.set(team.id, {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      qualified: false,
    })
    byGroup.set(team.group_letter, groupMap)
  }

  for (const match of matches) {
    if (match.stage !== 'group') continue
    if (match.status !== 'finished') continue
    if (match.home_score == null || match.away_score == null) continue

    const home = findStanding(byGroup, match.home_team_id)
    const away = findStanding(byGroup, match.away_team_id)
    if (!home || !away) continue

    home.played += 1
    away.played += 1
    home.goalsFor += match.home_score
    home.goalsAgainst += match.away_score
    away.goalsFor += match.away_score
    away.goalsAgainst += match.home_score

    if (match.home_score > match.away_score) {
      home.won += 1
      home.points += 3
      away.lost += 1
    } else if (match.home_score < match.away_score) {
      away.won += 1
      away.points += 3
      home.lost += 1
    } else {
      home.drawn += 1
      away.drawn += 1
      home.points += 1
      away.points += 1
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst
    away.goalDifference = away.goalsFor - away.goalsAgainst
  }

  const result = new Map<string, GroupStanding[]>()

  for (const [letter, groupMap] of byGroup) {
    const rows = [...groupMap.values()].sort(compareStandings)
    const complete = isGroupStageComplete(letter, matches, teams)
    const groupMatches = matches.filter(
      (m) =>
        m.stage === 'group' &&
        rows.some((r) => r.team.id === m.home_team_id || r.team.id === m.away_team_id),
    )
    rows.forEach((row, index) => {
      if (complete && index < 2) {
        row.qualified = true
      } else if (!complete && hasClinchedTopTwo(row.team.id, rows, groupMatches)) {
        row.qualified = true
      }
    })
    result.set(letter, rows)
  }

  promoteBestThirdPlaceQualifiers(result, teams, matches)

  return result
}

/** When every group is complete, the 8 best third-placed teams also qualify for R32. */
function promoteBestThirdPlaceQualifiers(
  standingsByGroup: Map<string, GroupStanding[]>,
  teams: TeamInfo[],
  matches: GroupMatch[],
): void {
  const lettersWithTeams = GROUP_LETTERS.filter((letter) =>
    teams.some((t) => t.group_letter === letter),
  )
  if (lettersWithTeams.length === 0) return
  if (!lettersWithTeams.every((letter) => isGroupStageComplete(letter, matches, teams))) {
    return
  }

  const thirdPlaced: GroupStanding[] = []
  for (const letter of lettersWithTeams) {
    const sorted = [...(standingsByGroup.get(letter) ?? [])].sort(compareStandings)
    if (sorted[2]) thirdPlaced.push(sorted[2])
  }

  for (const row of [...thirdPlaced].sort(compareStandings).slice(0, 8)) {
    row.qualified = true
  }
}

function findStanding(
  byGroup: Map<string, Map<string, GroupStanding>>,
  teamId: string,
): GroupStanding | undefined {
  for (const groupMap of byGroup.values()) {
    const row = groupMap.get(teamId)
    if (row) return row
  }
  return undefined
}

export function getMatchWinner(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number | null,
  awayScore: number | null,
  status: string,
  winnerTeamId?: string | null,
): string | null {
  if (status !== 'finished' || homeScore == null || awayScore == null) return null
  if (winnerTeamId) return winnerTeamId
  if (homeScore > awayScore) return homeTeamId
  if (awayScore > homeScore) return awayTeamId
  return null
}

const BRACKET_FEEDER_STAGES: KnockoutRound[] = [
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
]

function nextKnockoutStage(stage: KnockoutRound): KnockoutRound | null {
  switch (stage) {
    case 'round_of_32':
      return 'round_of_16'
    case 'round_of_16':
      return 'quarter_final'
    case 'quarter_final':
      return 'semi_final'
    case 'semi_final':
      return 'final'
    default:
      return null
  }
}

function propagateWinnersThroughBracket(rounds: Map<KnockoutRound, BracketSlot[]>) {
  for (const stage of BRACKET_FEEDER_STAGES) {
    const slots = rounds.get(stage) ?? []
    const nextStage = nextKnockoutStage(stage)
    if (!nextStage) continue

    const nextSlots = rounds.get(nextStage) ?? []
    const thirdPlaceSlots = rounds.get('third_place') ?? []

    slots.forEach((slot, matchIndex) => {
      if (!slot.home || !slot.away) return
      const winnerId = getMatchWinner(
        slot.home.id,
        slot.away.id,
        slot.homeScore,
        slot.awayScore,
        slot.status,
        slot.winnerTeamId,
      )
      if (!winnerId) return

      const winner = winnerId === slot.home.id ? slot.home : slot.away
      const loser = winnerId === slot.home.id ? slot.away : slot.home
      const feederIndex = Math.floor(matchIndex / 2)
      const slotSide = matchIndex % 2

      const target = nextSlots[feederIndex]
      if (target) {
        if (slotSide === 0) {
          target.home = winner
        } else {
          target.away = winner
        }
        target.isPlaceholder = false
      }

      if (stage === 'semi_final' && thirdPlaceSlots[0]) {
        const thirdPlace = thirdPlaceSlots[0]
        if (matchIndex === 0) {
          thirdPlace.home = loser
        } else if (matchIndex === 1) {
          thirdPlace.away = loser
        }
        thirdPlace.isPlaceholder = false
      }
    })
  }
}

export function buildKnockoutRounds(
  matches: KnockoutMatch[],
  qualifiedTeams: TeamInfo[] = [],
): Map<KnockoutRound, BracketSlot[]> {
  const rounds = new Map<KnockoutRound, BracketSlot[]>()
  let qualifiedQueue = [...qualifiedTeams]

  for (const stage of KNOCKOUT_ROUND_ORDER) {
    const stageMatches = matches
      .filter((m) => m.stage === stage)
      .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))

    const slots: BracketSlot[] = stageMatches.map((m) => ({
      id: m.id,
      home: m.home.id === TBD_TEAM.id ? null : m.home,
      away: m.away.id === TBD_TEAM.id ? null : m.away,
      homeScore: m.home_score,
      awayScore: m.away_score,
      status: m.status,
      kickoff_at: m.kickoff_at,
      isPlaceholder: false,
      winnerTeamId: m.winner_team_id,
      apiStatusShort: m.api_status_short,
    }))

    const expected = KNOCKOUT_MATCH_COUNTS[stage]
    while (slots.length < expected) {
      slots.push({
        id: `${stage}-tbd-${slots.length}`,
        home: null,
        away: null,
        homeScore: null,
        awayScore: null,
        status: 'scheduled',
        kickoff_at: null,
        isPlaceholder: true,
      })
    }

    if (stage === 'round_of_32' && qualifiedQueue.length > 0) {
      for (const slot of slots) {
        if (!slot.home && qualifiedQueue.length > 0) {
          slot.home = qualifiedQueue.shift() ?? null
          slot.isPlaceholder = !slot.home && !slot.away
        }
        if (!slot.away && qualifiedQueue.length > 0) {
          slot.away = qualifiedQueue.shift() ?? null
          slot.isPlaceholder = !slot.home && !slot.away
        }
        if (slot.home || slot.away) slot.isPlaceholder = false
      }
    }

    rounds.set(stage, slots)
  }

  propagateWinnersThroughBracket(rounds)

  return rounds
}

export function formatKnockoutRound(stage: KnockoutRound): string {
  return formatStage(stage)
}
