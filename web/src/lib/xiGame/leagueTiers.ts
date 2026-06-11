/** API-Football league ids — Big 5 European leagues. */
const TIER_1_LEAGUE_IDS = new Set([39, 140, 135, 78, 61])

/** Strong domestic leagues + continental club competitions. */
const TIER_2_LEAGUE_IDS = new Set([
  2, // UEFA Champions League
  3, // UEFA Europa League
  40, 141, 79, 136, 62, // top-flight tier 2 in big nations
  88, 94, 203, 253, 71, 128, 262, 144, 218, 210, 179, 113, 103, 106, 119, 286, 283,
])

/** Weaker leagues in our domestic allow-list (Egypt, Qatar, etc.). */
const TIER_3_LEAGUE_IDS = new Set([197, 305, 301, 274, 188, 292, 98, 333, 235, 169, 207])

export function leagueRatingMultiplier(
  leagueId: number | null | undefined,
  ratingSource: string | null | undefined,
): number {
  const source = ratingSource ?? ''

  if (source === 'manual') return 1
  if (source === 'national_2025' || source === 'continental_2025') return 1
  if (source === 'fallback_2025') return 1

  if (leagueId != null) {
    if (TIER_1_LEAGUE_IDS.has(leagueId)) return 1
    if (TIER_2_LEAGUE_IDS.has(leagueId)) return 0.97
    if (TIER_3_LEAGUE_IDS.has(leagueId)) return 0.88
    return 0.92
  }

  switch (source) {
    case 'domestic_2025':
      return 0.94
    case 'club_2025':
      return 0.94
    case 'national_2025':
    case 'continental_2025':
    case 'fallback_2025':
      return 1
    case 'api':
      return 0.9
    case 'fallback':
      return 0.88
    case 'unrated':
      return 0.85
    default:
      return 0.92
  }
}
