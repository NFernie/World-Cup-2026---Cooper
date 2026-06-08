import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type UserPoolSummary = {
  id: string
  name: string
  invite_code: string
  isHost: boolean
  displayName?: string
  teamName?: string
  fifaCode?: string
}

export function useUserPools(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-pools', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<UserPoolSummary[]> => {
      const [memberships, hosted, teamsRes] = await Promise.all([
        supabase
          .from('pool_members')
          .select('display_name, assigned_team_id, pool_id, pools(id, name, invite_code, host_user_id)')
          .eq('user_id', userId!),
        supabase.from('pools').select('id, name, invite_code, host_user_id').eq('host_user_id', userId!),
        supabase.from('teams').select('id, name, fifa_code'),
      ])

      if (memberships.error) throw memberships.error
      if (hosted.error) throw hosted.error
      if (teamsRes.error) throw teamsRes.error

      const teamMap = new Map((teamsRes.data ?? []).map((t) => [t.id, t]))
      const map = new Map<string, UserPoolSummary>()

      for (const row of memberships.data ?? []) {
        const rawPool = row.pools as unknown
        const pool = (Array.isArray(rawPool) ? rawPool[0] : rawPool) as {
          id: string
          name: string
          invite_code: string
          host_user_id: string
        } | null
        if (!pool) continue
        const team = row.assigned_team_id ? teamMap.get(row.assigned_team_id) : undefined
        map.set(pool.id, {
          id: pool.id,
          name: pool.name,
          invite_code: pool.invite_code,
          isHost: pool.host_user_id === userId,
          displayName: row.display_name,
          teamName: team?.name ?? (row.assigned_team_id ? undefined : 'Awaiting team'),
          fifaCode: team?.fifa_code,
        })
      }

      for (const pool of hosted.data ?? []) {
        if (!map.has(pool.id)) {
          map.set(pool.id, {
            id: pool.id,
            name: pool.name,
            invite_code: pool.invite_code,
            isHost: true,
          })
        } else {
          map.get(pool.id)!.isHost = true
        }
      }

      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
    },
  })
}
