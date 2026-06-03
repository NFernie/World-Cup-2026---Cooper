import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type Props = {
  poolId: string
  teamId: string
  teamName: string
  currentMemberId: string
}

export function CoManagerBanner({ poolId, teamId, teamName, currentMemberId }: Props) {
  const { data: coManagers } = useQuery({
    queryKey: ['co-managers', poolId, teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_team_co_managers')
        .select('display_name, pool_member_id')
        .eq('pool_id', poolId)
        .eq('team_id', teamId)
        .order('join_order')
      if (error) throw error
      return data ?? []
    },
  })

  const others =
    coManagers?.filter((m) => m.pool_member_id !== currentMemberId).map((m) => `@${m.display_name}`) ??
    []

  if (others.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        You are the sole manager of <strong className="text-[var(--foreground)]">{teamName}</strong>.
      </p>
    )
  }

  return (
    <p className="rounded-lg border border-fifa-gold/40 bg-fifa-gold/10 px-3 py-2 text-sm">
      You&apos;re co-managing <strong>{teamName}</strong> with {others.join(' and ')} (
      {others.length + 1} owners).
    </p>
  )
}
