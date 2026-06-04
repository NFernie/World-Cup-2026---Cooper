/**
 * Map API-Football `team.code` values to our `teams.fifa_code` when they differ.
 * Direct uppercase match is tried first; then these aliases; then normalized name.
 */
export const API_CODE_TO_FIFA: Record<string, string> = {
  CUR: "CUW",
  ZAF: "RSA",
  KOR: "KOR",
  SKR: "KOR",
  CIV: "CIV",
  CPV: "CPV",
  COD: "COD",
  CGO: "COD",
};

export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Resolve our fifa_code from API team row. */
export function resolveFifaCode(
  apiCode: string | null | undefined,
  apiName: string,
  knownFifaCodes: Set<string>,
): string | null {
  const code = (apiCode ?? "").trim().toUpperCase();
  if (code) {
    const mapped = API_CODE_TO_FIFA[code] ?? code;
    if (knownFifaCodes.has(mapped)) return mapped;
  }
  return null;
}
