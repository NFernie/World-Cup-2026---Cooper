import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

type Team = { fifa_code: string; name: string }

export function useJoinReveal() {
  const navigate = useNavigate()
  const [reveal, setReveal] = useState<{ assigned: Team; allTeams: Team[]; poolId: string } | null>(
    null,
  )

  const startReveal = async (poolId: string, assignedTeamId: string) => {
    const [{ data: allTeams, error: tErr }, { data: assigned, error: aErr }] = await Promise.all([
      supabase.from('teams').select('fifa_code, name').order('name'),
      supabase.from('teams').select('fifa_code, name').eq('id', assignedTeamId).single(),
    ])
    if (tErr || aErr || !assigned) {
      navigate(`/pools/${poolId}`)
      return
    }
    setReveal({ assigned, allTeams: allTeams ?? [], poolId })
  }

  const completeReveal = () => {
    if (reveal) navigate(`/pools/${reveal.poolId}`)
    setReveal(null)
  }

  return { reveal, startReveal, completeReveal }
}
