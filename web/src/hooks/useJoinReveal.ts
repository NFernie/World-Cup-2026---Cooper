import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

const TOTAL_NATIONS = 48

type Team = { fifa_code: string; name: string }

type RevealState = {
  assigned: Team
  allTeams: Team[]
  poolId: string
  spinTeamCount: number
}

export function useJoinReveal() {
  const navigate = useNavigate()
  const [reveal, setReveal] = useState<RevealState | null>(null)
  const revealRef = useRef(reveal)
  revealRef.current = reveal

  const startReveal = useCallback(async (poolId: string, assignedTeamId: string) => {
    const [
      { count: memberCount, error: cErr },
      { data: assigned, error: aErr },
      { data: members, error: mErr },
      { data: allTeams, error: tErr },
    ] = await Promise.all([
      supabase
        .from('pool_members')
        .select('*', { count: 'exact', head: true })
        .eq('pool_id', poolId),
      supabase.from('teams').select('id, fifa_code, name').eq('id', assignedTeamId).single(),
      supabase.from('pool_members').select('assigned_team_id').eq('pool_id', poolId),
      supabase.from('teams').select('id, fifa_code, name').order('name'),
    ])
    if (cErr || aErr || mErr || tErr || !assigned) {
      navigate(`/pools/${poolId}`)
      return
    }

    const otherAssignedIds = new Set(
      (members ?? [])
        .map((m) => m.assigned_team_id)
        .filter((id) => id !== assignedTeamId),
    )

    const carouselTeams = (allTeams ?? [])
      .filter((team) => !otherAssignedIds.has(team.id))
      .map(({ fifa_code, name }) => ({ fifa_code, name }))

    const spinTeamCount = Math.max(1, TOTAL_NATIONS - (memberCount ?? 0))

    setReveal({
      assigned: { fifa_code: assigned.fifa_code, name: assigned.name },
      allTeams: carouselTeams.length > 0 ? carouselTeams : [{ fifa_code: assigned.fifa_code, name: assigned.name }],
      poolId,
      spinTeamCount,
    })
  }, [navigate])

  const completeReveal = useCallback(() => {
    const current = revealRef.current
    if (current) navigate(`/pools/${current.poolId}`)
    setReveal(null)
  }, [navigate])

  return { reveal, startReveal, completeReveal }
}
