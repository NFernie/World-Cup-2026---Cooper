import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { getInviteUrl } from '@/lib/urls'

export function JoinPoolPage() {
  const { inviteCode: inviteCodeParam } = useParams<{ inviteCode?: string }>()
  const [searchParams] = useSearchParams()
  const inviteFromQuery = searchParams.get('code') ?? ''
  const initialCode = inviteCodeParam ?? inviteFromQuery

  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'invite' | 'name'>('invite')
  const [inviteCode, setInviteCode] = useState(initialCode)
  const [poolName, setPoolName] = useState('')
  const [displayName, setDisplayName] = useState('')

  const poolByInviteQuery = useQuery({
    queryKey: ['pool-by-invite', inviteCode],
    enabled: mode === 'invite' && inviteCode.length >= 6,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pools')
        .select('*')
        .eq('invite_code', inviteCode.trim())
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const poolByNameQuery = useQuery({
    queryKey: ['pool-by-name', poolName],
    enabled: mode === 'name' && poolName.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pools')
        .select('*')
        .ilike('name', poolName.trim())
        .limit(5)
      if (error) throw error
      return data ?? []
    },
  })

  const joinMutation = useMutation({
    mutationFn: async (poolId: string) => {
      const { data, error } = await supabase.rpc('join_pool', {
        p_pool_id: poolId,
        p_display_name: displayName.trim(),
      })
      if (error) throw error
      return data
    },
    onSuccess: (_data, poolId) => navigate(`/pools/${poolId}`),
  })

  const activePool =
    mode === 'invite' ? poolByInviteQuery.data : poolByNameQuery.data?.[0]

  if (authLoading) return <p className="text-[var(--muted)]">Loading…</p>

  if (!user) {
    const returnPath =
      mode === 'invite' && inviteCode
        ? `/join/${inviteCode}`
        : `/join${poolName ? `?name=${encodeURIComponent(poolName)}` : ''}`
    sessionStorage.setItem('post_auth_redirect', returnPath)
    return (
      <Card>
        <CardTitle>Sign in to join</CardTitle>
        <CardDescription className="mt-1">You need an account before joining a pool.</CardDescription>
        <Button asChild className="mt-4">
          <Link to="/login">Sign in with magic link</Link>
        </Button>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card>
        <CardTitle>Join with invite or pool name</CardTitle>
        <CardDescription className="mt-1">
          Each pool assigns you a national team for that competition only.
        </CardDescription>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'invite' ? 'default' : 'outline'}
            onClick={() => setMode('invite')}
          >
            Invite code
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'name' ? 'default' : 'outline'}
            onClick={() => setMode('name')}
          >
            Pool name
          </Button>
        </div>
      </Card>

      <Card>
        {mode === 'invite' ? (
          <div className="space-y-2">
            <Label htmlFor="inviteCode">Invite code from your host</Label>
            <Input
              id="inviteCode"
              placeholder="Paste code from share link"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
            {poolByInviteQuery.data && (
              <p className="text-sm text-fifa-green">Found: {poolByInviteQuery.data.name}</p>
            )}
            {poolByInviteQuery.isFetched && inviteCode && !poolByInviteQuery.data && (
              <p className="text-sm text-red-600">No pool found for that code.</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="poolName">Pool name (exact name from host)</Label>
            <Input
              id="poolName"
              placeholder="Cooper work crew"
              value={poolName}
              onChange={(e) => setPoolName(e.target.value)}
            />
            {poolByNameQuery.data && poolByNameQuery.data.length > 1 && (
              <p className="text-sm text-amber-600">Multiple matches — use invite code instead.</p>
            )}
            {poolByNameQuery.data?.[0] && (
              <p className="text-sm text-fifa-green">Found: {poolByNameQuery.data[0].name}</p>
            )}
          </div>
        )}

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!activePool) return
            joinMutation.mutate(activePool.id)
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
          <Button
            type="submit"
            className="w-full"
            disabled={!activePool || joinMutation.isPending}
          >
            {joinMutation.isPending ? 'Joining…' : 'Join & get my team'}
          </Button>
        </form>

        {activePool && (
          <p className="mt-3 break-all text-xs text-[var(--muted)]">
            Share link: {getInviteUrl(activePool.invite_code)}
          </p>
        )}
      </Card>
    </div>
  )
}
