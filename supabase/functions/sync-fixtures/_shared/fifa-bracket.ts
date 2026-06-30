/**
 * FIFA World Cup 2026 knockout bracket (regulations arts. 12.6–12.11).
 * Match numbers M73–M104; advancement is NOT kickoff order.
 * @see https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage
 */

export type BracketSlotSide = 'home' | 'away'

export type BracketFeed = {
  feederMatch: number
  targetMatch: number
  targetSlot: BracketSlotSide
}

/** Winner of feederMatch → target slot in targetMatch. */
export const FIFA_KNOCKOUT_FEEDS: BracketFeed[] = [
  // Round of 32 → Round of 16 (reg. 12.7)
  { feederMatch: 74, targetMatch: 89, targetSlot: 'home' },
  { feederMatch: 77, targetMatch: 89, targetSlot: 'away' },
  { feederMatch: 73, targetMatch: 90, targetSlot: 'home' },
  { feederMatch: 75, targetMatch: 90, targetSlot: 'away' },
  { feederMatch: 76, targetMatch: 91, targetSlot: 'home' },
  { feederMatch: 78, targetMatch: 91, targetSlot: 'away' },
  { feederMatch: 79, targetMatch: 92, targetSlot: 'home' },
  { feederMatch: 80, targetMatch: 92, targetSlot: 'away' },
  { feederMatch: 83, targetMatch: 93, targetSlot: 'home' },
  { feederMatch: 84, targetMatch: 93, targetSlot: 'away' },
  { feederMatch: 81, targetMatch: 94, targetSlot: 'home' },
  { feederMatch: 82, targetMatch: 94, targetSlot: 'away' },
  { feederMatch: 86, targetMatch: 95, targetSlot: 'home' },
  { feederMatch: 88, targetMatch: 95, targetSlot: 'away' },
  { feederMatch: 85, targetMatch: 96, targetSlot: 'home' },
  { feederMatch: 87, targetMatch: 96, targetSlot: 'away' },
  // Round of 16 → Quarter-finals (reg. 12.8)
  { feederMatch: 89, targetMatch: 97, targetSlot: 'home' },
  { feederMatch: 90, targetMatch: 97, targetSlot: 'away' },
  { feederMatch: 93, targetMatch: 98, targetSlot: 'home' },
  { feederMatch: 94, targetMatch: 98, targetSlot: 'away' },
  { feederMatch: 91, targetMatch: 99, targetSlot: 'home' },
  { feederMatch: 92, targetMatch: 99, targetSlot: 'away' },
  { feederMatch: 95, targetMatch: 100, targetSlot: 'home' },
  { feederMatch: 96, targetMatch: 100, targetSlot: 'away' },
  // Quarter-finals → Semi-finals (reg. 12.9)
  { feederMatch: 97, targetMatch: 101, targetSlot: 'home' },
  { feederMatch: 98, targetMatch: 101, targetSlot: 'away' },
  { feederMatch: 99, targetMatch: 102, targetSlot: 'home' },
  { feederMatch: 100, targetMatch: 102, targetSlot: 'away' },
  // Semi-finals → Final (reg. 12.11)
  { feederMatch: 101, targetMatch: 104, targetSlot: 'home' },
  { feederMatch: 102, targetMatch: 104, targetSlot: 'away' },
]

/** Loser of semi → third-place match (reg. 12.10). */
export const FIFA_SEMI_LOSER_FEEDS: BracketFeed[] = [
  { feederMatch: 101, targetMatch: 103, targetSlot: 'home' },
  { feederMatch: 102, targetMatch: 103, targetSlot: 'away' },
]

export const FIFA_KNOCKOUT_MATCH_RANGE = { min: 73, max: 104 } as const

export function parseFifaMatchNumber(round: string | null | undefined): number | null {
  if (!round) return null
  const labeled = round.match(/match\s*(\d{2,3})/i)
  if (labeled) return Number(labeled[1])
  const trailing = round.match(/(?:^|\s|-)(\d{2,3})$/)
  if (trailing) {
    const n = Number(trailing[1])
    if (n >= 1 && n <= 104) return n
  }
  return null
}

export type TeamSlotCode = `${'1' | '2' | '3'}${string}`

export type R32SlotPattern = {
  matchNumber: number
  home: TeamSlotCode
  away: TeamSlotCode
}

/**
 * Round of 32 slot patterns (reg. 12.6) with third-place pairings for the
 * combination where groups B,D,E,F,I,J,K,L supplied the eight best third-placed teams.
 */
export const R32_SLOT_PATTERNS: R32SlotPattern[] = [
  { matchNumber: 73, home: '2A', away: '2B' },
  { matchNumber: 74, home: '1E', away: '3D' },
  { matchNumber: 75, home: '1F', away: '2C' },
  { matchNumber: 76, home: '1C', away: '2F' },
  { matchNumber: 77, home: '1I', away: '3F' },
  { matchNumber: 78, home: '2E', away: '2I' },
  { matchNumber: 79, home: '1A', away: '3E' },
  { matchNumber: 80, home: '1L', away: '3K' },
  { matchNumber: 81, home: '1D', away: '3B' },
  { matchNumber: 82, home: '1G', away: '3I' },
  { matchNumber: 83, home: '2K', away: '2L' },
  { matchNumber: 84, home: '1H', away: '2J' },
  { matchNumber: 85, home: '1B', away: '3J' },
  { matchNumber: 86, home: '1J', away: '2H' },
  { matchNumber: 87, home: '1K', away: '3L' },
  { matchNumber: 88, home: '2D', away: '2G' },
]

export function teamSlotCode(
  groupLetter: string | null,
  groupPosition: number | null,
): TeamSlotCode | null {
  if (!groupLetter || groupPosition == null || groupPosition < 1 || groupPosition > 3) {
    return null
  }
  return `${groupPosition}${groupLetter}` as TeamSlotCode
}

export function inferRoundOf32MatchNumber(
  homeSlot: TeamSlotCode,
  awaySlot: TeamSlotCode,
): number | null {
  for (const pattern of R32_SLOT_PATTERNS) {
    const forward =
      pattern.home === homeSlot && pattern.away === awaySlot
    const reverse =
      pattern.home === awaySlot && pattern.away === homeSlot
    if (forward || reverse) return pattern.matchNumber
  }
  return null
}

export function feedsForWinner(matchNumber: number): BracketFeed[] {
  return FIFA_KNOCKOUT_FEEDS.filter((f) => f.feederMatch === matchNumber)
}

export function semiLoserFeed(matchNumber: number): BracketFeed | undefined {
  return FIFA_SEMI_LOSER_FEEDS.find((f) => f.feederMatch === matchNumber)
}
