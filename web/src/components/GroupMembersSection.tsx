import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TeamFlag } from '@/components/TeamFlag'
import { TeamRevealAnimation } from '@/components/TeamRevealAnimation'
import { useJoinReveal } from '@/hooks/useJoinReveal'
import { maskMemberName } from '@/lib/poolNames'
import { supabase } from '@/lib/supabase'

type Props = {
  poolId: string
  isHost: boolean
  revealNames: boolean
  hostUserId: string
  viewerUserId: string | undefined
}

type GroupMemberRow = {
  id: string
  user_id: string
  display_name: string
  join_order: number
  assigned_team_id: string | null
  teams: { name: string; fifa_code: string } | { name: string; fifa_code: string }[] | null
}

export function GroupMembersSection({
  poolId,
  isHost,
  revealNames,
  hostUserId,
  viewerUserId,
}: Props) {
  const queryClient = useQueryClient()
  const { reveal, startReveal, completeReveal } = useJoinReveal({ navigateOnComplete: false })
  const nameVisibility = { revealNames, hostUserId, viewerUserId }

  const membersQuery = useQuery({
    queryKey: ['group-members', poolId],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_members')
        .select('id, user_id, display_name, join_order, assigned_team_id, teams(name, fifa_code)')
        .eq('pool_id', poolId)
        .order('join_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as GroupMemberRow[]
    },
  })

  const assignMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc('assign_pool_member_team', {
        p_pool_member_id: memberId,
      })
      if (error) throw error
      return data
    },
    onSuccess: (member) => {
      if (!member.assigned_team_id) return
      void startReveal(poolId, member.assigned_team_id, 'fast')
    },
  })

  const members = membersQuery.data ?? []
  const unassignedCount = members.filter((m) => !m.assigned_team_id).length

  const invalidateMemberQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['group-members', poolId] })
    queryClient.invalidateQueries({ queryKey: ['pool-member', poolId] })
    queryClient.invalidateQueries({ queryKey: ['pool-member-theme', poolId] })
    queryClient.invalidateQueries({ queryKey: ['leaderboard-odds', poolId] })
    queryClient.invalidateQueries({ queryKey: ['leaderboard-tournament', poolId] })
    queryClient.invalidateQueries({ queryKey: ['pool-members', poolId] })
  }

  return (
    <>
      {reveal && (
        <TeamRevealAnimation
          allTeams={reveal.allTeams}
          assigned={reveal.assigned}
          spinTeamCount={reveal.spinTeamCount}
          speed={reveal.speed}
          onComplete={() => completeReveal(invalidateMemberQueries)}
        />
      )}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Group members</h2>
          <p className="text-sm text-[var(--muted)]">
            {isHost
              ? 'Assign a nation to each member. The flag reveal runs at double speed.'
              : 'Members appear here as they join. Your host assigns nations from this board.'}
          </p>
          {unassignedCount > 0 && (
            <p className="mt-1 text-sm text-amber-600">
              {unassignedCount} member{unassignedCount === 1 ? '' : 's'} awaiting team assignment
            </p>
          )}
        </div>
        <div className="space-y-2">
          {members.map((row, index) => {
            const rawTeam = row.teams
            const team = Array.isArray(rawTeam) ? rawTeam[0] : rawTeam
            const playerLabel = maskMemberName(row.display_name, nameVisibility, row.user_id)
            const isYou = viewerUserId === row.user_id

            return (
              <div
                key={row.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 leaderboard-row-accent ${
                  isYou ? 'leaderboard-row-you' : ''
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {team ? (
                    <TeamFlag fifaCode={team.fifa_code} size={40} title={team.name} />
                  ) : (
                    <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-[var(--background)] text-xs text-[var(--muted)]">
                      TBD
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">
                      #{index + 1} {playerLabel}
                      {isYou && (
                        <span className="ml-1 text-xs font-normal text-fifa-green">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {team ? `${team.name} (${team.fifa_code})` : 'Awaiting team assignment'}
                    </p>
                  </div>
                </div>
                {isHost && !row.assigned_team_id && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={assignMutation.isPending}
                    onClick={() => assignMutation.mutate(row.id)}
                  >
                    <UserPlus className="h-4 w-4" />
                    Assign team
                  </Button>
                )}
              </div>
            )
          })}
          {!membersQuery.isLoading && members.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No members have joined yet.</p>
          )}
        </div>
        {assignMutation.error && (
          <p className="text-sm text-red-600">{(assignMutation.error as Error).message}</p>
        )}
      </section>
    </>
  )
}
