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
