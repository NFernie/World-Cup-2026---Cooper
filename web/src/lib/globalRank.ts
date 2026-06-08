export function formatFifaWorldRanking(rank: number | null | undefined): string {
  return rank != null ? `Fifa World Ranking: #${rank}` : 'Fifa World Ranking: —'
}

/** @deprecated Use formatFifaWorldRanking */
export function formatGlobalRank(rank: number | null | undefined): string {
  return formatFifaWorldRanking(rank)
}
