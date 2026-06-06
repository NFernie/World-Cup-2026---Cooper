/** National team head coach and playing captain (WC 2026 squads — update as squads are confirmed). */
export type TeamStaff = {
  headCoach: string
  captain: string
}

export const TEAM_STAFF: Record<string, TeamStaff> = {
  MEX: { headCoach: 'Javier Aguirre', captain: 'Guillermo Ochoa' },
  RSA: { headCoach: 'Hugo Broos', captain: 'Ronwen Williams' },
  KOR: { headCoach: 'Hong Myung-bo', captain: 'Son Heung-min' },
  CZE: { headCoach: 'Ivan Hašek', captain: 'Tomáš Souček' },
  CAN: { headCoach: 'Jesse Marsch', captain: 'Alphonso Davies' },
  QAT: { headCoach: 'Bruno Pinheiro', captain: 'Hassan Al-Haydos' },
  SUI: { headCoach: 'Murat Yakin', captain: 'Granit Xhaka' },
  BIH: { headCoach: 'Sergej Barbarez', captain: 'Edin Džeko' },
  BRA: { headCoach: 'Dorival Júnior', captain: 'Casemiro' },
  MAR: { headCoach: 'Walid Regragui', captain: 'Romain Saïss' },
  HAI: { headCoach: 'Sebastián Masi', captain: 'Donovan Leon' },
  SCO: { headCoach: 'Steve Clarke', captain: 'Andy Robertson' },
  USA: { headCoach: 'Mauricio Pochettino', captain: 'Christian Pulisic' },
  PAR: { headCoach: 'Alfaro Barrios', captain: 'Gustavo Gómez' },
  AUS: { headCoach: 'Graham Arnold', captain: 'Mathew Ryan' },
  TUR: { headCoach: 'Vincenzo Montella', captain: 'Hakan Çalhanoğlu' },
  GER: { headCoach: 'Julian Nagelsmann', captain: 'Joshua Kimmich' },
  CUW: { headCoach: 'Dick Advocaat', captain: 'Cuco Martina' },
  CIV: { headCoach: 'Emerse Fae', captain: 'Sébastien Haller' },
  ECU: { headCoach: 'Sebastián Beccacece', captain: 'Enner Valencia' },
  NED: { headCoach: 'Ronald Koeman', captain: 'Virgil van Dijk' },
  JPN: { headCoach: 'Hajime Moriyasu', captain: 'Wataru Endo' },
  TUN: { headCoach: 'Samuel Zauber', captain: 'Youssef Msakni' },
  SWE: { headCoach: 'Jon Dahl Tomasson', captain: 'Victor Lindelöf' },
  BEL: { headCoach: 'Domenico Tedesco', captain: 'Kevin De Bruyne' },
  EGY: { headCoach: 'Hossam Hassan', captain: 'Mohamed Salah' },
  IRN: { headCoach: 'Amir Ghalenoei', captain: 'Alireza Jahanbakhsh' },
  NZL: { headCoach: 'Darije Kalezić', captain: 'Winston Reid' },
  ESP: { headCoach: 'Luis de la Fuente', captain: 'Álvaro Morata' },
  CPV: { headCoach: 'Bubista', captain: 'Ryan Mendes' },
  KSA: { headCoach: 'Roberto Mancini', captain: 'Salem Al-Dawsari' },
  URU: { headCoach: 'Marcelo Bielsa', captain: 'Diego Godín' },
  FRA: { headCoach: 'Didier Deschamps', captain: 'Kylian Mbappé' },
  SEN: { headCoach: 'Aliou Cissé', captain: 'Kalidou Koulibaly' },
  NOR: { headCoach: 'Ståle Solbakken', captain: 'Martin Ødegaard' },
  IRQ: { headCoach: 'Jesús Casas', captain: 'Zaid Hussein' },
  ARG: { headCoach: 'Lionel Scaloni', captain: 'Lionel Messi' },
  ALG: { headCoach: 'Rabah Madjer', captain: 'Riyad Mahrez' },
  AUT: { headCoach: 'Ralf Rangnick', captain: 'David Alaba' },
  JOR: { headCoach: 'Hussein Ammouta', captain: 'Yaseen Al-Bakhit' },
  POR: { headCoach: 'Roberto Martínez', captain: 'Cristiano Ronaldo' },
  ENG: { headCoach: 'Thomas Tuchel', captain: 'Harry Kane' },
  CRO: { headCoach: 'Zlatko Dalić', captain: 'Luka Modrić' },
  COL: { headCoach: 'Néstor Lorenzo', captain: 'James Rodríguez' },
  UZB: { headCoach: 'Srečko Katanec', captain: 'Eldor Shomurodov' },
  COD: { headCoach: 'Sébastien Desabre', captain: 'Chancel Mbemba' },
  PAN: { headCoach: 'Thomas Christiansen', captain: 'Aníbal Godoy' },
  GHA: { headCoach: 'Otto Addo', captain: 'Thomas Partey' },
}

export function getTeamStaff(fifaCode: string): TeamStaff {
  return TEAM_STAFF[fifaCode.toUpperCase()] ?? { headCoach: 'TBC', captain: 'TBC' }
}
