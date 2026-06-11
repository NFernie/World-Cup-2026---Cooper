#!/usr/bin/env node
/**
 * Top N players after read-time rating adjustments (league mult + nation clamp + star floor).
 * No API-Football — reads teams + squad_players from Supabase only.
 */
const FIFA_WEIGHT = 0.55
const TOP11_WEIGHT = 0.45
const NATION_CLAMP_BELOW = 8
const NATION_CLAMP_ABOVE = 12
const STAR_TOP_N = 3
const STAR_FLOOR_ABOVE_FIFA = 6
const PLAYER_OVR_MIN = 50
const PLAYER_OVR_MAX = 94

const TIER_1 = new Set([39, 140, 135, 78, 61])
const TIER_2 = new Set([
  2, 3, 40, 141, 79, 136, 62, 88, 94, 203, 253, 71, 128, 262, 144, 218, 210, 179, 113, 103, 106, 119, 286, 283,
])
const TIER_3 = new Set([197, 305, 301, 274, 188, 292, 98, 333, 235, 169, 207])

const URL = process.env.VITE_SUPABASE_URL ?? process.argv[2]
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.argv[3]
const LIMIT = Number(process.env.LIMIT ?? 20)

if (!URL || !KEY) {
  console.error('Usage: URL KEY [or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY]')
  process.exit(1)
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function fifaTeamOvr(rank) {
  if (rank == null || rank <= 0) return 70
  return Math.round(Math.min(86, Math.max(58, 86 - (rank - 1) * 0.32)))
}

function leagueMult(leagueId, source) {
  if (source === 'manual') return 1
  if (source === 'national_2025' || source === 'continental_2025' || source === 'fallback_2025') return 1
  if (leagueId != null) {
    if (TIER_1.has(leagueId)) return 1
    if (TIER_2.has(leagueId)) return 0.97
    if (TIER_3.has(leagueId)) return 0.88
    return 0.92
  }
  switch (source) {
    case 'domestic_2025':
    case 'club_2025':
      return 0.94
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

function adjustSquad(players, fifaRank) {
  const fifaOvr = fifaTeamOvr(fifaRank)
  const min = fifaOvr - NATION_CLAMP_BELOW
  const max = fifaOvr + NATION_CLAMP_ABOVE
  const starFloor = fifaOvr + STAR_FLOOR_ABOVE_FIFA

  const starIds = new Set(
    [...players]
      .filter((p) => p.overall_rating >= fifaOvr - NATION_CLAMP_BELOW)
      .sort((a, b) => b.overall_rating - a.overall_rating)
      .slice(0, STAR_TOP_N)
      .map((p) => p.id),
  )

  const withLeague = players.map((p) => {
    let ovr = p.overall_rating
    if (p.rating_source !== 'manual' && ovr > 0) {
      ovr = Math.round(ovr * leagueMult(p.baseline_league_id, p.rating_source))
      ovr = clamp(ovr, Math.max(PLAYER_OVR_MIN, min), Math.min(PLAYER_OVR_MAX, max))
    }
    return { ...p, adjusted: ovr }
  })

  return withLeague.map((p) => {
    let ovr = p.adjusted
    if (starIds.has(p.id) && p.rating_source !== 'manual') {
      ovr = Math.max(ovr, starFloor)
    }
    ovr = clamp(ovr, Math.max(PLAYER_OVR_MIN, min), Math.min(PLAYER_OVR_MAX, max))
    return { ...p, adjusted: ovr }
  })
}

async function signup() {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `top-adj-${Date.now()}@example.com`,
      password: 'TestPass123!',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(JSON.stringify(data))
  return data.access_token
}

async function fetchAll(path, token) {
  const all = []
  let from = 0
  const page = 1000
  while (true) {
    const res = await fetch(`${URL}/rest/v1/${path}&limit=${page}&offset=${from}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(await res.text())
    const batch = await res.json()
    all.push(...batch)
    if (batch.length < page) break
    from += page
  }
  return all
}

const token = await signup()
const teams = await fetchAll('teams?select=id,name,fifa_code,global_fifa_rank', token)
let players
try {
  players = await fetchAll(
    'squad_players?select=id,team_id,name,overall_rating,rating_source,baseline_league_id,position,position_code',
    token,
  )
} catch {
  players = await fetchAll(
    'squad_players?select=id,team_id,name,overall_rating,rating_source,position,position_code',
    token,
  )
}

const teamById = new Map(teams.map((t) => [t.id, t]))
const byTeam = new Map()
for (const p of players) {
  const list = byTeam.get(p.team_id) ?? []
  list.push(p)
  byTeam.set(p.team_id, list)
}

const adjusted = []
for (const [teamId, squad] of byTeam) {
  const team = teamById.get(teamId)
  const rows = adjustSquad(squad, team?.global_fifa_rank)
  for (const r of rows) {
    adjusted.push({
      name: r.name,
      raw: r.overall_rating,
      ovr: r.adjusted,
      team: team?.name ?? '?',
      code: team?.fifa_code ?? '?',
      source: r.rating_source,
      position: r.position_code ? `${r.position_code}/${r.position}` : r.position,
    })
  }
}

adjusted.sort((a, b) => b.ovr - a.ovr || b.raw - a.raw)
const top = adjusted.filter((p) => p.ovr > 0).slice(0, LIMIT)

console.log(`\nTop ${LIMIT} players (after league mult + nation clamp + star floor)\n`)
console.log(['#', 'Player', 'OVR', 'Raw', 'Nation', 'Pos', 'Source'].join('\t'))
top.forEach((p, i) => {
  console.log([i + 1, p.name, p.ovr, p.raw, `${p.team} (${p.code})`, p.position, p.source].join('\t'))
})
