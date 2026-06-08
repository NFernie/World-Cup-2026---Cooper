export function formatGlobalRank(rank: number | null | undefined): string {
  return rank != null ? `FIFA #${rank}` : 'FIFA —'
}
