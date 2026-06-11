import { supabase } from '@/lib/supabase'
import { applySquadRatingAdjustments, type SquadPlayerRow } from './playerRatingAdjust'
import type { SquadPlayer } from './types'

const SQUAD_SELECT_BASE =
  'id, team_id, name, position, position_code, position_detail, shirt_number, photo_url, overall_rating, rating_source'

const PAGE_SIZE = 1000

async function fetchFifaRankByTeamId(): Promise<Map<string, number | null>> {
  const { data, error } = await supabase.from('teams').select('id, global_fifa_rank')
  if (error) throw error
  return new Map((data ?? []).map((t) => [t.id, t.global_fifa_rank]))
}

/** Load every squad_players row (Supabase caps at 1000 per request). */
export async function fetchAllSquadPlayers(): Promise<SquadPlayer[]> {
  const [fifaRankByTeamId, players] = await Promise.all([
    fetchFifaRankByTeamId(),
    fetchRawSquadPlayers(),
  ])
  return applySquadRatingAdjustments(players, fifaRankByTeamId)
}

async function fetchRawSquadPlayers(): Promise<SquadPlayerRow[]> {
  const selectFull = `${SQUAD_SELECT_BASE}, baseline_league_id, has_continental_rating`
  const selectWithLeague = `${SQUAD_SELECT_BASE}, baseline_league_id`
  let select = selectFull
  let from = 0
  const all: SquadPlayerRow[] = []

  while (true) {
    const { data, error } = await supabase
      .from('squad_players')
      .select(select)
      .order('overall_rating', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error && select === selectFull) {
      select = selectWithLeague
      from = 0
      all.length = 0
      continue
    }
    if (error && select === selectWithLeague) {
      select = SQUAD_SELECT_BASE
      from = 0
      all.length = 0
      continue
    }
    if (error) throw error

    const batch = (data ?? []) as unknown as SquadPlayerRow[]
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}
