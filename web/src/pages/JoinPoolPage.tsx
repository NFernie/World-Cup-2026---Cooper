import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { TeamRevealAnimation } from '@/components/TeamRevealAnimation'
import { useJoinReveal } from '@/hooks/useJoinReveal'
import { getGroupJoinUrl } from '@/lib/urls'

export function JoinPoolPage() {
  const { inviteCode: inviteCodeParam } = useParams<{ inviteCode?: string }>()
  const [searchParams] = useSearchParams()
  const inviteFromQuery = searchParams.get('code') ?? ''
  const nameFromQuery = searchParams.get('name') ?? ''
  const initialCode = inviteCodeParam ?? inviteFromQuery

  const { user, username: authUsername, loading: authLoading } = useAuth()

  const [mode, setMode] = useState<'invite' | 'name'>(initialCode ? 'invite' : 'invite')
  const [groupCode, setGroupCode] = useState(initialCode)
  const [groupName, setGroupName] = useState(nameFromQuery)
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    if (authUsername) {
      setDisplayName((prev) => (prev ? prev : authUsername))
    }
  }, [authUsername])

  useEffect(() => {
    if (initialCode) setGroupCode(initialCode)
    if (nameFromQuery) setGroupName(nameFromQuery)
  }, [initialCode, nameFromQuery])

  const poolByInviteQuery = useQuery({
    queryKey: ['pool-by-invite', groupCode],
    enabled: mode === 'invite' && groupCode.trim().length >= 6,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pools')
        .select('*')
        .eq('invite_code', groupCode.trim())
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (poolByInviteQuery.data?.name && !groupName) {
      setGroupName(poolByInviteQuery.data.name)
    }
  }, [poolByInviteQuery.data?.name, groupName])

  const poolByNameQuery = useQuery({
    queryKey: ['pool-by-name', groupName],
    enabled: mode === 'name' && groupName.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pools')
        .select('*')
        .ilike('name', groupName.trim())
        .limit(5)
      if (error) throw error
      return data ?? []
    },
  })

  const { reveal, startReveal, completeReveal } = useJoinReveal()

  const joinMutation = useMutation({
    mutationFn: async (poolId: string) => {
      const { data, error } = await supabase.rpc('join_pool', {
        p_pool_id: poolId,
        p_display_name: displayName.trim(),
      })
      if (error) throw error
      return data
    },
    onSuccess: (data) => startReveal(data.pool_id, data.assigned_team_id),
  })

  const activePool =
    mode === 'invite' ? poolByInviteQuery.data : poolByNameQuery.data?.[0]

  const joinReturnPath = () => {
    const params = new URLSearchParams()
    if (groupName.trim()) params.set('name', groupName.trim())
    const qs = params.toString()
    if (mode === 'invite' && groupCode.trim()) {
      return `/join/${groupCode.trim()}${qs ? `?${qs}` : ''}`
    }
    return `/join${qs ? `?${qs}` : ''}`
  }

  if (authLoading) return <p className="text-[var(--muted)]">Loading…</p>

  if (!user) {
    sessionStorage.setItem('post_auth_redirect', joinReturnPath())
    return (
      <Card className="mx-auto max-w-md">
        <CardTitle>Sign in to join this group</CardTitle>
        <CardDescription className="mt-1">
          Create an account or sign in — you&apos;ll return here with the group details filled in.
          You only need to enter your display name to join.
        </CardDescription>
        {(initialCode || nameFromQuery) && (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
            {initialCode && (
              <p>
                <span className="text-[var(--muted)]">Group code: </span>
                <span className="font-mono font-medium">{initialCode}</span>
              </p>
            )}
            {nameFromQuery && (
              <p className={initialCode ? 'mt-1' : ''}>
                <span className="text-[var(--muted)]">Group name: </span>
                <span className="font-medium">{nameFromQuery}</span>
              </p>
            )}
          </div>
        )}
        <Button asChild className="mt-4 w-full">
          <Link to="/login">Sign in or sign up</Link>
        </Button>
      </Card>
    )
  }

  const fromShareLink = Boolean(initialCode)

  return (
    <>
      {reveal && (
        <TeamRevealAnimation
          allTeams={reveal.allTeams}
          assigned={reveal.assigned}
          onComplete={completeReveal}
        />
      )}
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <CardTitle>Join a group</CardTitle>
          <CardDescription className="mt-1">
            {fromShareLink
              ? 'Your group code and name are pre-filled from the share link.'
              : 'Use a group code from your host, or search by group name.'}
          </CardDescription>
          {!fromShareLink && (
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === 'invite' ? 'default' : 'outline'}
                onClick={() => setMode('invite')}
              >
                Group code
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === 'name' ? 'default' : 'outline'}
                onClick={() => setMode('name')}
              >
                Group name
              </Button>
            </div>
          )}
        </Card>

        <Card>
          {mode === 'invite' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="groupCode">Group code</Label>
                <Input
                  id="groupCode"
                  placeholder="From Share Group link"
                  value={groupCode}
                  onChange={(e) => setGroupCode(e.target.value)}
                  readOnly={fromShareLink}
                  className={fromShareLink ? 'bg-[var(--background)]' : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="groupNameFromCode">Group name</Label>
                <Input
                  id="groupNameFromCode"
                  placeholder="Filled automatically when code is valid"
                  value={groupName || poolByInviteQuery.data?.name || ''}
                  onChange={(e) => setGroupName(e.target.value)}
                  readOnly={fromShareLink || Boolean(poolByInviteQuery.data?.name)}
                  className={
                    fromShareLink || poolByInviteQuery.data?.name
                      ? 'bg-[var(--background)]'
                      : undefined
                  }
                />
              </div>
              {poolByInviteQuery.data && (
                <p className="text-sm text-fifa-green">Group found — ready to join.</p>
              )}
              {poolByInviteQuery.isFetched && groupCode && !poolByInviteQuery.data && (
                <p className="text-sm text-red-600">No group found for that code.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="groupNameSearch">Group name</Label>
              <Input
                id="groupNameSearch"
                placeholder="Exact name from your host"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
              {poolByNameQuery.data && poolByNameQuery.data.length > 1 && (
                <p className="text-sm text-amber-600">Multiple matches — use group code instead.</p>
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
              <Label htmlFor="displayName">Your display name in the group</Label>
              <Input
                id="displayName"
                required
                placeholder="How others see you on the leaderboard"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <p className="text-xs text-[var(--muted)]">
                Your account username is separate — this is your name inside this group only.
              </p>
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
              Share group: {getGroupJoinUrl(activePool.invite_code, activePool.name)}
            </p>
          )}
        </Card>
      </div>
    </>
  )
}
