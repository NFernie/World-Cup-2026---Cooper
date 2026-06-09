import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { BanterXiShare } from '@/components/xiGame/BanterXiShare'
import { supabase } from '@/lib/supabase'

type BanterMessage = {
  id: string
  display_name: string
  message: string
  metadata_json: unknown
  created_at: string
}

type Props = {
  poolId: string
  memberId: string | undefined
  displayName: string | undefined
  userId: string | undefined
}

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function BanterBox({ poolId, memberId, displayName, userId }: Props) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')

  const messagesQuery = useQuery({
    queryKey: ['banter-messages', poolId],
    enabled: Boolean(poolId && memberId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_banter_messages')
        .select('id, display_name, message, metadata_json, created_at')
        .eq('pool_id', poolId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as BanterMessage[]
    },
    refetchInterval: 30_000,
  })

  const postMutation = useMutation({
    mutationFn: async () => {
      const text = message.trim()
      if (!memberId || !displayName || !userId) throw new Error('Join the group to post banter.')
      if (!text) throw new Error('Write something first.')
      if (text.length > 500) throw new Error('Keep banter under 500 characters.')

      const { error } = await supabase.from('pool_banter_messages').insert({
        pool_id: poolId,
        pool_member_id: memberId,
        user_id: userId,
        display_name: displayName,
        message: text,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setMessage('')
      queryClient.invalidateQueries({ queryKey: ['banter-messages', poolId] })
    },
  })

  const messages = messagesQuery.data ?? []

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/15">
          <MessageCircle className="h-6 w-6 text-[var(--primary)]" aria-hidden />
        </div>
        <div>
          <CardTitle className="text-xl">Banter Box</CardTitle>
          <CardDescription className="mt-1">
            This space is for hilarious banter only. Rude or unsavoury comments will not be
            tolerated.
          </CardDescription>
        </div>
      </div>

      {memberId ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            postMutation.mutate()
          }}
        >
          <textarea
            className="min-h-24 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            maxLength={500}
            placeholder="Drop your funniest World Cup banter..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--muted)]">{message.trim().length}/500 characters</p>
            <Button type="submit" disabled={postMutation.isPending || !message.trim()}>
              {postMutation.isPending ? 'Posting...' : 'Post banter'}
            </Button>
          </div>
          {postMutation.error && (
            <p className="text-sm text-red-600">{(postMutation.error as Error).message}</p>
          )}
        </form>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">Join the group to post banter.</p>
      )}

      <div className="mt-5 space-y-3">
        {messages.map((item) => (
          <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-[var(--foreground)]">{item.display_name}</p>
              <p className="text-xs text-[var(--muted)]">{formatMessageTime(item.created_at)}</p>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{item.message}</p>
            {item.metadata_json != null && (
              <BanterXiShare metadata={item.metadata_json} poolId={poolId} />
            )}
          </div>
        ))}
        {!messagesQuery.isLoading && messages.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No banter yet. Be the brave first voice.</p>
        )}
      </div>
    </Card>
  )
}
