import { supabase } from '@/lib/supabase'
import type { SquadPlayer } from './types'

const SQUAD_SELECT =
  'id, team_id, name, position, position_code, position_detail, shirt_number, photo_url, overall_rating'

const PAGE_SIZE = 1000

/** Load every squad_players row (Supabase caps at 1000 per request). */
export async function fetchAllSquadPlayers(): Promise<SquadPlayer[]> {
  const all: SquadPlayer[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('squad_players')
      .select(SQUAD_SELECT)
      .order('overall_rating', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error

    const batch = (data ?? []) as SquadPlayer[]
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}
