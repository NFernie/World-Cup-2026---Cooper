import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function AdminPage() {
  const { isSuperAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const poolId = searchParams.get('pool')
  const queryClient = useQueryClient()
  const [selectedMatch, setSelectedMatch] = useState('')
  const [homeScore, setHomeScore] = useState('0')
  const [awayScore, setAwayScore] = useState('0')

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('id, name, fifa_code').order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const matchesQuery = useQuery({
    queryKey: ['admin-matches'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('id, kickoff_at, status, home_score, away_score, home_team_id, away_team_id')
        .order('kickoff_at')
      if (error) throw error
      return data ?? []
    },
  })

  const teamName = (id: string) => teamsQuery.data?.find((t) => t.id === id)?.name ?? id.slice(0, 8)

  const membersQuery = useQuery({
    queryKey: ['admin-members', poolId],
    enabled: isSuperAdmin && Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_members')
        .select('id, display_name, assigned_team_id')
        .eq('pool_id', poolId!)
      if (error) throw error
      return data ?? []
    },
  })

  const overrideScore = useMutation({
    mutationFn: async () => {
      const matchId = selectedMatch
      const h = parseInt(homeScore, 10)
      const a = parseInt(awayScore, 10)
      const { data: existing } = await supabase
        .from('matches')
        .select('home_score, away_score')
        .eq('id', matchId)
        .single()

      const { error: updateError } = await supabase
        .from('matches')
        .update({
          home_score: h,
          away_score: a,
          status: 'finished',
          scores_synced_at: new Date().toISOString(),
        })
        .eq('id', matchId)
      if (updateError) throw updateError

      const { data: userData } = await supabase.auth.getUser()
      await supabase.from('match_score_audit').insert({
        match_id: matchId,
        admin_user_id: userData.user!.id,
        previous_home: existing?.home_score,
        previous_away: existing?.away_score,
        new_home: h,
        new_away: a,
        note: 'Manual admin override',
      })

      await supabase.rpc('recalculate_pool_member_points', { p_match_id: matchId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard-odds'] })
      queryClient.invalidateQueries({ queryKey: ['admin-matches'] })
    },
  })

  const reassignTeam = useMutation({
    mutationFn: async ({ memberId, teamId }: { memberId: string; teamId: string }) => {
      const { error } = await supabase
        .from('pool_members')
        .update({ assigned_team_id: teamId })
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-members', poolId] }),
  })

  if (!isSuperAdmin) {
    return <p className="text-red-600">Super-admin access required.</p>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Super-admin</h1>
      <Card>
        <CardTitle>Override match result</CardTitle>
        <CardDescription className="mt-1">
          Hybrid Path C fallback when API-Football sync fails. Recalculates odds points.
        </CardDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            overrideScore.mutate()
          }}
        >
          <div className="space-y-2">
            <Label>Match</Label>
            <select
              className="w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3"
              value={selectedMatch}
              onChange={(e) => setSelectedMatch(e.target.value)}
              required
            >
              <option value="">Select match</option>
              {matchesQuery.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {teamName(m.home_team_id)} vs {teamName(m.away_team_id)} ({m.status})
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="space-y-2 flex-1">
              <Label>Home</Label>
              <Input value={homeScore} onChange={(e) => setHomeScore(e.target.value)} type="number" min={0} />
            </div>
            <div className="space-y-2 flex-1">
              <Label>Away</Label>
              <Input value={awayScore} onChange={(e) => setAwayScore(e.target.value)} type="number" min={0} />
            </div>
          </div>
          <Button type="submit" disabled={overrideScore.isPending}>
            Save & recalculate points
          </Button>
        </form>
      </Card>

      {poolId && (
        <Card>
          <CardTitle>Reassign team (pool members)</CardTitle>
          <div className="mt-3 space-y-3">
            {membersQuery.data?.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{m.display_name}</span>
                <select
                  className="h-8 rounded border border-[var(--border)] px-2"
                  defaultValue={m.assigned_team_id}
                  onChange={(e) =>
                    reassignTeam.mutate({ memberId: m.id, teamId: e.target.value })
                  }
                >
                  {teamsQuery.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
