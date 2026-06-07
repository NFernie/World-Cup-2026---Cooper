import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

type Props = {
  poolId: string
  revealNames: boolean
  isHost: boolean
}

export function RevealNamesControl({ poolId, revealNames, isHost }: Props) {
  const queryClient = useQueryClient()

  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from('pools')
        .update({ reveal_names: next })
        .eq('id', poolId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pool', poolId] })
    },
  })

  return (
    <Card className="p-5">
      <CardTitle className="text-lg">Member name visibility</CardTitle>
      <CardDescription className="mt-1">
        {revealNames
          ? 'Display names are visible to all members on leaderboards and co-manager lists.'
          : 'Display names are hidden from other members. You always see your own name.'}
        {!isHost && ' Only the host can change this setting.'}
      </CardDescription>
      <Button
        type="button"
        className="mt-4 w-full max-w-xs"
        variant={revealNames ? 'outline' : 'default'}
        disabled={!isHost || toggleMutation.isPending}
        onClick={() => toggleMutation.mutate(!revealNames)}
      >
        {revealNames ? (
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
