import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { isRevealNamesEnabled } from '@/lib/poolNames'
import { supabase } from '@/lib/supabase'
import type { Pool } from '@/types/database'

type Props = {
  poolId: string
  revealNames: boolean
  isHost: boolean
}

export function RevealNamesControl({ poolId, revealNames, isHost }: Props) {
  const queryClient = useQueryClient()
  const namesRevealed = isRevealNamesEnabled(revealNames)

  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const { data, error } = await supabase.rpc('set_pool_reveal_names', {
        p_pool_id: poolId,
        p_reveal_names: next,
      })
      if (error) throw error
      return data as Pool
    },
    onSuccess: (pool) => {
      queryClient.setQueryData(['pool', poolId], pool)
      queryClient.invalidateQueries({ queryKey: ['pool', poolId] })
      queryClient.invalidateQueries({ queryKey: ['co-managers', poolId] })
      queryClient.invalidateQueries({ queryKey: ['leaderboard-odds', poolId] })
      queryClient.invalidateQueries({ queryKey: ['leaderboard-tournament', poolId] })
    },
  })

  return (
    <Card className="p-5">
      <CardTitle className="text-lg">User Name Visibility</CardTitle>
      <CardDescription className="mt-1">
        {namesRevealed
          ? 'Display names are visible to all members on leaderboards and co-manager lists.'
          : 'Display names are hidden from other members. You only see your own name.'}
        {!isHost && ' Only the host can change this setting.'}
      </CardDescription>
      <Button
        type="button"
        className="mt-4 w-full max-w-xs"
        variant={namesRevealed ? 'outline' : 'default'}
        disabled={!isHost || toggleMutation.isPending}
        onClick={() => toggleMutation.mutate(!namesRevealed)}
      >
        {namesRevealed ? (
          <>
            <EyeOff className="h-4 w-4" /> Hide user names
          </>
        ) : (
          <>
            <Eye className="h-4 w-4" /> Reveal user names
          </>
        )}
      </Button>
      {toggleMutation.error && (
        <p className="mt-2 text-sm text-red-600">{(toggleMutation.error as Error).message}</p>
      )}
    </Card>
  )
}
