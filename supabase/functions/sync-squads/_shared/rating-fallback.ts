/** FIFA-rank squad baseline when API-Football has no usable rating row. */

export function teamBaseRating(globalFifaRank: number | null | undefined): number {
  if (globalFifaRank == null || globalFifaRank <= 0) return 70;
  return Math.round(Math.min(86, Math.max(58, 86 - (globalFifaRank - 1) * 0.32)));
}

/** Deterministic −4…+4 spread from player name within a nation squad. */
export function nameRatingOffset(playerName: string): number {
  let hash = 0;
  for (let i = 0; i < playerName.length; i++) {
    hash = (hash * 31 + playerName.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 9) - 4;
}

export function playerFallbackRating(
  globalFifaRank: number | null | undefined,
  playerName: string,
): number {
  const base = teamBaseRating(globalFifaRank);
  const offset = nameRatingOffset(playerName);
  return Math.max(52, Math.min(90, base + offset));
}
