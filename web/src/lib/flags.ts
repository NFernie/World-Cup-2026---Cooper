/** Map FIFA codes to ISO 3166-1 alpha-2 for flagcdn.com */
const FIFA_TO_ISO: Record<string, string> = {
  MEX: 'mx',
  RSA: 'za',
  KOR: 'kr',
  CZE: 'cz',
  CAN: 'ca',
  QAT: 'qa',
  SUI: 'ch',
  BIH: 'ba',
  BRA: 'br',
  MAR: 'ma',
  HAI: 'ht',
  SCO: 'gb-sct',
  USA: 'us',
  PAR: 'py',
  AUS: 'au',
  TUR: 'tr',
  GER: 'de',
  CUW: 'cw',
  CIV: 'ci',
  ECU: 'ec',
  NED: 'nl',
  JPN: 'jp',
  TUN: 'tn',
  SWE: 'se',
  BEL: 'be',
  EGY: 'eg',
  IRN: 'ir',
  NZL: 'nz',
  ESP: 'es',
  CPV: 'cv',
  KSA: 'sa',
  URU: 'uy',
  FRA: 'fr',
  SEN: 'sn',
  NOR: 'no',
  IRQ: 'iq',
  ARG: 'ar',
  ALG: 'dz',
  AUT: 'at',
  JOR: 'jo',
  POR: 'pt',
  ENG: 'gb-eng',
  CRO: 'hr',
  COL: 'co',
  UZB: 'uz',
  COD: 'cd',
  PAN: 'pa',
  GHA: 'gh',
}

/** flagcdn.com only serves specific widths (others return 404). */
const FLAGCDN_WIDTHS = [20, 40, 80, 160, 320, 640] as const

function flagcdnWidth(requested: number): number {
  for (const w of FLAGCDN_WIDTHS) {
    if (w >= requested) return w
  }
  return 640
}

export function getFlagUrl(fifaCode: string, width = 160): string {
  const code = (fifaCode ?? '').trim().toUpperCase()
  if (!code) return ''
  const iso = FIFA_TO_ISO[code] ?? code.toLowerCase().slice(0, 2)
  const w = flagcdnWidth(width)
  return `https://flagcdn.com/w${w}/${iso}.png`
}

/** Warm browser cache for a list of FIFA codes. */
export function preloadFlags(fifaCodes: string[], width = 160): void {
  const seen = new Set<string>()
  for (const code of fifaCodes) {
    const key = code.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    const img = new Image()
    img.src = getFlagUrl(key, width)
  }
}
