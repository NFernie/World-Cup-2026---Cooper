import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

type Props = {
  poolId: string
  memberId: string | undefined
  isHost: boolean
  revealNames: boolean
}

export function RevealNamesPoll({ poolId, memberId, isHost, revealNames }: Props) {
  const queryClient = useQueryClient()

  const votesQuery = useQuery({
    queryKey: ['reveal-name-votes', poolId],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_reveal_name_votes')
        .select('pool_member_id, wants_reveal')
        .eq('pool_id', poolId)
      if (error) throw error
      return data ?? []
    },
  })

  const voteMutation = useMutation({
    mutationFn: async (wantsReveal: boolean) => {
      if (!memberId) throw new Error('Join the group to vote')
      const { error } = await supabase.from('pool_reveal_name_votes').upsert(
        {
          pool_id: poolId,
          pool_member_id: memberId,
          wants_reveal: wantsReveal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'pool_id,pool_member_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reveal-name-votes', poolId] })
    },
  })

  const votes = votesQuery.data ?? []
  const revealVotes = votes.filter((v) => v.wants_reveal).length
  const hiddenVotes = votes.filter((v) => !v.wants_reveal).length
  const totalVotes = votes.length
  const myVote = votes.find((v) => v.pool_member_id === memberId)
  const majorityReveal = totalVotes > 0 && revealVotes > hiddenVotes
  const majorityHidden = totalVotes > 0 && hiddenVotes > revealVotes
  const tied = totalVotes > 0 && revealVotes === hiddenVotes

  return (
    <Card className="p-5">
      <CardTitle className="text-lg">Name reveal poll</CardTitle>
      <CardDescription className="mt-1">
        Vote whether member display names should be visible in this group. The host makes the final
        call.
      </CardDescription>

      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-lg border border-[var(--border)] px-3 py-2">
          <p className="text-2xl font-bold tabular-nums text-fifa-green">{revealVotes}</p>
          <p className="text-xs text-[var(--muted)]">Vote to reveal</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] px-3 py-2">
          <p className="text-2xl font-bold tabular-nums">{hiddenVotes}</p>
          <p className="text-xs text-[var(--muted)]">Vote to keep hidden</p>
        </div>
      </div>

      {totalVotes > 0 && (
        <p className="mt-3 text-sm text-[var(--muted)]">
          {tied
            ? 'Poll is tied — host decides.'
            : majorityReveal
              ? 'Majority voted to reveal names.'
              : majorityHidden
                ? 'Majority voted to keep names hidden.'
                : null}
          {isHost && !revealNames && majorityReveal && ' You can reveal names with the button above.'}
          {isHost && revealNames && majorityHidden && ' You can hide names with the button above.'}
        </p>
      )}

      {memberId ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={myVote?.wants_reveal === true ? 'default' : 'outline'}
            disabled={voteMutation.isPending}
            onClick={() => voteMutation.mutate(true)}
          >
            I want names revealed
          </Button>
          <Button
            type="button"
            size="sm"
            variant={myVote?.wants_reveal === false ? 'default' : 'outline'}
            disabled={voteMutation.isPending}
            onClick={() => voteMutation.mutate(false)}
          >
            Keep names hidden
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">Join the group to vote in this poll.</p>
      )}

      {voteMutation.error && (
        <p className="mt-2 text-sm text-red-600">{(voteMutation.error as Error).message}</p>
      )}
    </Card>
  )
}
