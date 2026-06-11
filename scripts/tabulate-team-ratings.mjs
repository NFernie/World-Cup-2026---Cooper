#!/usr/bin/env node
/**
 * Print Top-11, FIFA anchor, and blended nation OVR for all WC teams.
 * Reads teams + squad_players from Supabase only — no API-Football calls.
 *
 * Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (or pass as args)
 */
const URL = process.env.VITE_SUPABASE_URL ?? process.argv[2]
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.argv[3]

const FIFA_WEIGHT = 0.55
const TOP11_WEIGHT = 0.45
const WC_SQUAD_SIZE = 26

if (!URL || !KEY) {
  console.error(
    'Usage: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/tabulate-team-ratings.mjs',
  )
  process.exit(1)
}

async function signup() {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `ratings-tab-${Date.now()}@example.com`,
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

function fifaTeamOvr(rank) {
  if (rank == null || rank <= 0) return 70
  return Math.round(Math.min(86, Math.max(58, 86 - (rank - 1) * 0.32)))
}

const STAR_WEIGHTS = [1.0, 0.965, 0.93, 0.895, 0.86, 0.825, 0.79, 0.755, 0.72, 0.685, 0.65]

function teamStarWeightedTop11(players) {
  const rated = players
    .filter((p) => p.overall_rating > 0)
    .sort((a, b) => b.overall_rating - a.overall_rating)
    .slice(0, WC_SQUAD_SIZE)
    .slice(0, 11)
  if (rated.length === 0) return 0
  let weightedSum = 0
  let weightTotal = 0
  for (let i = 0; i < rated.length; i++) {
    const w = STAR_WEIGHTS[i] ?? STAR_WEIGHTS[STAR_WEIGHTS.length - 1]
    weightedSum += rated[i].overall_rating * w
    weightTotal += w
  }
  return Math.round(weightedSum / weightTotal)
}

function teamAnchoredOvr(players, rank) {
  const fifa = fifaTeamOvr(rank)
  const top11 = teamStarWeightedTop11(players)
  if (top11 <= 0) return fifa
  return Math.round(FIFA_WEIGHT * fifa + TOP11_WEIGHT * top11)
}

const token = await signup()
const teams = await fetchAll(
  'teams?select=id,name,fifa_code,global_fifa_rank&order=global_fifa_rank.asc.nullslast',
  token,
)
const players = await fetchAll(
  'squad_players?select=team_id,overall_rating&order=overall_rating.desc',
  token,
)

const byTeam = new Map()
for (const p of players) {
  const list = byTeam.get(p.team_id) ?? []
  list.push(p)
  byTeam.set(p.team_id, list)
}

const rows = teams.map((t) => {
  const squad = byTeam.get(t.id) ?? []
  const top11 = teamStarWeightedTop11(squad)
  const fifa = fifaTeamOvr(t.global_fifa_rank)
  const blended = teamAnchoredOvr(squad, t.global_fifa_rank)
  return {
    rank: t.global_fifa_rank,
    name: t.name,
    code: t.fifa_code,
    top11,
    fifa,
    blended,
  }
})

rows.sort((a, b) => b.blended - a.blended || (a.rank ?? 999) - (b.rank ?? 999))

console.log('\nWorld Cup 2026 nation OVR (55% FIFA + 45% star-weighted Top-11)\n')
console.log(
  ['#', 'Team', 'Code', 'FIFA', 'Top-11*', 'FIFA OVR', 'Blended'].join('\t'),
)
rows.forEach((r, i) => {
  console.log(
    [i + 1, r.name, r.code, r.rank ?? '-', r.top11, r.fifa, r.blended].join('\t'),
  )
})

const blended = rows.map((r) => r.blended).filter((n) => n > 0)
console.log(
  `\nRange: ${Math.min(...blended)}–${Math.max(...blended)} · Teams: ${rows.length}`,
)
