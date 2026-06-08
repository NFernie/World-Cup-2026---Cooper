import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { TeamRevealAnimation } from '@/components/TeamRevealAnimation'
import { useJoinReveal } from '@/hooks/useJoinReveal'
import { useAuth } from '@/hooks/useAuth'
import type { TeamAssignmentMode } from '@/lib/poolAssignment'

export function CreatePoolPage() {
  const navigate = useNavigate()
  const { user, username: authUsername } = useAuth()

  const { reveal, startReveal, completeReveal } = useJoinReveal()
  const [assignmentMode, setAssignmentMode] = useState<TeamAssignmentMode>('automatic')
  const [revealNames, setRevealNames] = useState(false)
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    if (authUsername) {
      setDisplayName((prev) => (prev ? prev : authUsername))
    }
  }, [authUsername])

  const createPool = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      const { data: pool, error } = await supabase
        .from('pools')
        .insert({
          name: name.trim(),
          host_user_id: user.id,
          reveal_names: revealNames,
          team_assignment_mode: assignmentMode,
        })
        .select()
        .single()
      if (error) throw error

      const { data: member, error: joinError } = await supabase.rpc('join_pool', {
        p_pool_id: pool.id,
        p_display_name: displayName.trim() || 'Host',
      })
      if (joinError) throw joinError

      return { pool, member, assignmentMode }
    },
    onSuccess: ({ pool, member, assignmentMode: mode }) => {
      if (mode === 'automatic' && member.assigned_team_id) {
        void startReveal(pool.id, member.assigned_team_id)
        return
      }
      navigate(`/pools/${pool.id}`)
    },
  })

  return (
    <>
      {reveal && (
        <TeamRevealAnimation
          allTeams={reveal.allTeams}
          assigned={reveal.assigned}
          spinTeamCount={reveal.spinTeamCount}
          speed={reveal.speed}
          onComplete={completeReveal}
        />
      )}
      <Card className="mx-auto max-w-md">
        <CardTitle>Create a group</CardTitle>
        <CardDescription className="mt-1">
          {assignmentMode === 'automatic'
            ? 'Members receive a nation automatically when they join.'
            : 'Members join first; you assign nations from the leaderboard.'}
        </CardDescription>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            createPool.mutate()
          }}
        >
          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
            <Label>Team assignment</Label>
            <p className="text-xs text-[var(--muted)]">
              Choose whether nations are assigned automatically on join, or manually by you as host.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1"
                variant={assignmentMode === 'automatic' ? 'default' : 'outline'}
                onClick={() => setAssignmentMode('automatic')}
              >
                Automatic
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1"
                variant={assignmentMode === 'host' ? 'default' : 'outline'}
                onClick={() => setAssignmentMode('host')}
              >
                Host assigns
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
            <Label>Reveal user names</Label>
            <p className="text-xs text-[var(--muted)]">
              Choose whether members can see each other&apos;s display names on leaderboards and
              co-manager lists. You can change this later.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1"
                variant={revealNames ? 'default' : 'outline'}
                onClick={() => setRevealNames(true)}
              >
                Reveal names
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1"
                variant={!revealNames ? 'default' : 'outline'}
                onClick={() => setRevealNames(false)}
              >
                Keep hidden
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Group name</Label>
            <Input
              id="name"
              required
              placeholder="Cooper work crew"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="displayName">Your name in this group</Label>
            <Input
              id="displayName"
              required
              placeholder="Cooper"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          {createPool.error && (
            <p className="text-sm text-red-600">{(createPool.error as Error).message}</p>
          )}
          <Button type="submit" className="w-full" disabled={createPool.isPending}>
            {createPool.isPending ? 'Creating…' : 'Create & join group'}
          </Button>
        </form>
      </Card>
    </>
  )
}
