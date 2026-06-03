import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function CreatePoolPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')

  const createPool = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      const { data: pool, error } = await supabase
        .from('pools')
        .insert({ name: name.trim(), host_user_id: user.id })
        .select()
        .single()
      if (error) throw error

      const { error: joinError } = await supabase.rpc('join_pool', {
        p_pool_id: pool.id,
        p_display_name: displayName.trim() || 'Host',
      })
      if (joinError) throw joinError

      return pool
    },
    onSuccess: (pool) => navigate(`/pools/${pool.id}`),
  })

  return (
    <Card className="max-w-md mx-auto">
      <CardTitle>Create a pool</CardTitle>
      <CardDescription className="mt-1">
        You&apos;ll join automatically with your own team assignment in this pool.
      </CardDescription>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          createPool.mutate()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Pool name</Label>
          <Input
            id="name"
            required
            placeholder="Cooper work crew"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="displayName">Your name in this pool</Label>
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
          {createPool.isPending ? 'Creating…' : 'Create & join pool'}
        </Button>
      </form>
    </Card>
  )
}
