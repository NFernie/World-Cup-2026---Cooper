import { Outlet, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TeamThemeProvider } from '@/hooks/useTeamTheme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export type PoolOutletContext = {
  assignedTeamId?: string
}

export function PoolShell() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useAuth()

  const memberQuery = useQuery({
    queryKey: ['pool-member-theme', poolId, user?.id],
    enabled: Boolean(poolId && user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_members')
        .select('assigned_team_id, teams(fifa_code)')
        .eq('pool_id', poolId!)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const rawTeam = memberQuery.data?.teams as unknown
  const team = (Array.isArray(rawTeam) ? rawTeam[0] : rawTeam) as { fifa_code: string } | null
  const fifaCode = team?.fifa_code

  return (
    <TeamThemeProvider fifaCode={fifaCode}>
      <Outlet
        context={
          { assignedTeamId: memberQuery.data?.assigned_team_id } satisfies PoolOutletContext
        }
      />
    </TeamThemeProvider>
  )
}
