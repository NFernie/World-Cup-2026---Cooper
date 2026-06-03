import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function JoinPoolPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')

  const poolQuery = useQuery({
    queryKey: ['pool-by-invite', inviteCode],
    enabled: Boolean(inviteCode),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pools')
        .select('*')
        .eq('invite_code', inviteCode!)
        .single()
      if (error) throw error
      return data
    },
  })

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!poolQuery.data) throw new Error('Pool not found')
      const { data, error } = await supabase.rpc('join_pool', {
        p_pool_id: poolQuery.data.id,
        p_display_name: displayName.trim(),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => navigate(`/pools/${poolQuery.data!.id}`),
  })

  if (authLoading || poolQuery.isLoading) {
    return <p className="text-[var(--muted)]">Loading pool…</p>
  }

  if (poolQuery.isError || !poolQuery.data) {
    return <p className="text-red-600">Invalid or expired invite link.</p>
  }

  const pool = poolQuery.data
  const inviteUrl = `${window.location.origin}/join/${pool.invite_code}`

  if (!user) {
    sessionStorage.setItem('post_auth_redirect', `/join/${inviteCode}`)
    return (
      <Card>
        <CardTitle>Join {pool.name}</CardTitle>
        <CardDescription className="mt-1">Sign in first, then pick your display name.</CardDescription>
        <Button asChild className="mt-4">
          <a href={`/login`}>Sign in to join</a>
        </Button>
      </Card>
    )
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardTitle>Join {pool.name}</CardTitle>
      <CardDescription className="mt-1">
        You&apos;ll be assigned a national team automatically — fair round-robin style.
      </CardDescription>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          joinMutation.mutate()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="displayName">Your name in the pool</Label>
          <Input
            id="displayName"
            required
            placeholder="Cooper"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        {joinMutation.error && (
          <p className="text-sm text-red-600">{(joinMutation.error as Error).message}</p>
        )}
        <Button type="submit" className="w-full" disabled={joinMutation.isPending}>
          {joinMutation.isPending ? 'Joining…' : 'Join & get my team'}
        </Button>
      </form>
      <p className="mt-4 break-all text-xs text-[var(--muted)]">Invite link: {inviteUrl}</p>
    </Card>
  )
}
