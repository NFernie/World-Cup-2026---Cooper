/** National team theme colours (primary = accent, secondary = highlight). */
export type TeamTheme = {
  primary: string
  secondary: string
}

const DEFAULT_THEME: TeamTheme = { primary: '#00a651', secondary: '#c9a227' }

export const TEAM_THEMES: Record<string, TeamTheme> = {
  MEX: { primary: '#006847', secondary: '#CE1126' },
  RSA: { primary: '#007A4D', secondary: '#FFB81C' },
  KOR: { primary: '#CD2E3A', secondary: '#0047A0' },
  CZE: { primary: '#11457E', secondary: '#D7141A' },
  CAN: { primary: '#FF0000', secondary: '#FFFFFF' },
  QAT: { primary: '#8A1538', secondary: '#FFFFFF' },
  SUI: { primary: '#FF0000', secondary: '#FFFFFF' },
  BIH: { primary: '#002395', secondary: '#FECB00' },
  BRA: { primary: '#009C3B', secondary: '#FFDF00' },
  MAR: { primary: '#C1272D', secondary: '#006233' },
  HAI: { primary: '#00209F', secondary: '#D21034' },
  SCO: { primary: '#005EB8', secondary: '#FFFFFF' },
  USA: { primary: '#3C3B6E', secondary: '#B22234' },
  PAR: { primary: '#D52B1E', secondary: '#0038A8' },
  AUS: { primary: '#FFCD00', secondary: '#00843D' },
  TUR: { primary: '#E30A17', secondary: '#FFFFFF' },
  GER: { primary: '#000000', secondary: '#DD0000' },
  CUW: { primary: '#002B7F', secondary: '#F9E814' },
  CIV: { primary: '#FF8200', secondary: '#009E60' },
  ECU: { primary: '#FFDD00', secondary: '#034EA2' },
  NED: { primary: '#FF6600', secondary: '#21468B' },
  JPN: { primary: '#BC002D', secondary: '#FFFFFF' },
  TUN: { primary: '#E70013', secondary: '#FFFFFF' },
  SWE: { primary: '#006AA7', secondary: '#FECC00' },
  BEL: { primary: '#EF3340', secondary: '#FAE042' },
  EGY: { primary: '#CE1126', secondary: '#000000' },
  IRN: { primary: '#239F40', secondary: '#FFFFFF' },
  NZL: { primary: '#000000', secondary: '#FFFFFF' },
  ESP: { primary: '#AA151B', secondary: '#F1BF00' },
  CPV: { primary: '#003893', secondary: '#CF2027' },
  KSA: { primary: '#006C35', secondary: '#FFFFFF' },
  URU: { primary: '#0038A8', secondary: '#FFFFFF' },
  FRA: { primary: '#0055A4', secondary: '#EF4135' },
  SEN: { primary: '#00853F', secondary: '#FDEF42' },
  NOR: { primary: '#BA0C2F', secondary: '#00205B' },
  IRQ: { primary: '#CE1126', secondary: '#000000' },
  ARG: { primary: '#74ACDF', secondary: '#FFFFFF' },
  ALG: { primary: '#FFFFFF', secondary: '#006233' },
  AUT: { primary: '#ED2939', secondary: '#FFFFFF' },
  JOR: { primary: '#007A3D', secondary: '#000000' },
  POR: { primary: '#006600', secondary: '#FF0000' },
  ENG: { primary: '#FFFFFF', secondary: '#CE1124' },
  CRO: { primary: '#FF0000', secondary: '#FFFFFF' },
  COL: { primary: '#FCD116', secondary: '#003893' },
  UZB: { primary: '#1EB53A', secondary: '#FFFFFF' },
  COD: { primary: '#007FFF', secondary: '#F7D618' },
  PAN: { primary: '#DA121A', secondary: '#005293' },
  GHA: { primary: '#EF3340', secondary: '#FCD116' },
}

export function getTeamTheme(fifaCode: string | null | undefined): TeamTheme {
  if (!fifaCode) return DEFAULT_THEME
  return TEAM_THEMES[fifaCode.toUpperCase()] ?? DEFAULT_THEME
}

export type ColorMode = 'light' | 'dark'

export type AccessiblePoolColors = {
  accent: string
  accentForeground: string
}

function normalizeHex(hex: string): string | null {
  const raw = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null
  return `#${raw.toUpperCase()}`
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const raw = normalized.slice(1)
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.round(Math.min(255, Math.max(0, n)))
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

function mixHex(a: string, b: string, ratio: number): string {
  const rgbA = hexToRgb(a)
  const rgbB = hexToRgb(b)
  if (!rgbA || !rgbB) return a
  const t = Math.min(1, Math.max(0, ratio))
  return rgbToHex(
    rgbA[0] + (rgbB[0] - rgbA[0]) * t,
    rgbA[1] + (rgbB[1] - rgbA[1]) * t,
    rgbA[2] + (rgbB[2] - rgbA[2]) * t,
  )
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function foregroundForAccent(accent: string): string {
  return relativeLuminance(accent) > 0.55 ? '#071018' : '#FFFFFF'
}

function scoreAccent(accent: string, bgLum: number): number {
  const accentLum = relativeLuminance(accent)
  const foreground = foregroundForAccent(accent)
  const fgLum = relativeLuminance(foreground)
  const buttonContrast = contrastRatio(accentLum, fgLum)
  const surfaceContrast = contrastRatio(accentLum, bgLum)
  if (buttonContrast < 4.5 || surfaceContrast < 3) return 0
  return buttonContrast * surfaceContrast
}

function tuneAccent(hex: string, mode: ColorMode): string {
  const bgLum = mode === 'dark' ? 0.025 : 0.96
  const toward = mode === 'dark' ? '#FFFFFF' : '#071018'
  for (let step = 0.1; step <= 1; step += 0.1) {
    const tuned = mixHex(hex, toward, step)
    if (scoreAccent(tuned, bgLum) > 0) return tuned
  }
  return mode === 'dark' ? DEFAULT_THEME.primary : '#00C85E'
}

/** Theme-aware accent for buttons and interactive UI inside pool pages. */
export function resolveAccessiblePoolColors(
  theme: TeamTheme,
  mode: ColorMode,
): AccessiblePoolColors {
  const bgLum = mode === 'dark' ? 0.025 : 0.96
  const candidates = [theme.primary, theme.secondary, DEFAULT_THEME.primary]

  let accent = DEFAULT_THEME.primary
  let bestScore = 0

  for (const candidate of candidates) {
    const score = scoreAccent(candidate, bgLum)
    if (score > bestScore) {
      bestScore = score
      accent = candidate
    }
  }

  if (bestScore === 0) {
    accent = tuneAccent(theme.primary, mode)
    if (scoreAccent(accent, bgLum) === 0) {
      accent = tuneAccent(theme.secondary, mode)
    }
  }

  return {
    accent,
    accentForeground: foregroundForAccent(accent),
  }
}
