import { useQuery } from '@tanstack/react-query'
import { maskMemberName } from '@/lib/poolNames'
import { supabase } from '@/lib/supabase'

type Props = {
  poolId: string
  teamId: string
  teamName: string
  currentMemberId: string
  revealNames: boolean
  hostUserId: string
  viewerUserId: string | undefined
}

export function CoManagerBanner({
  poolId,
  teamId,
  teamName,
  currentMemberId,
  revealNames,
  hostUserId,
  viewerUserId,
}: Props) {
  const visibility = { revealNames, hostUserId, viewerUserId }

  const { data: coManagers } = useQuery({
    queryKey: ['co-managers', poolId, teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_team_co_managers')
        .select('pool_member_id, display_name, user_id')
        .eq('pool_id', poolId)
        .eq('team_id', teamId)
        .order('join_order')
      if (error) throw error
      return data ?? []
    },
  })

  const others =
    coManagers?.filter((m) => m.pool_member_id !== currentMemberId) ?? []

  if (others.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        You are the sole manager of <strong className="text-[var(--foreground)]">{teamName}</strong>.
      </p>
    )
  }

  const visibleNames = others.map((m) =>
    maskMemberName(m.display_name, visibility, m.user_id),
  )
  const allHidden = visibleNames.every((name) => name === 'Hidden player')

  return (
    <p className="rounded-lg border border-fifa-gold/40 bg-fifa-gold/10 px-3 py-2 text-sm">
      You&apos;re co-managing <strong>{teamName}</strong> with{' '}
      {allHidden ? (
        <>
          {others.length === 1 ? '1 other manager' : `${others.length} other managers`} (
          {others.length + 1} total).
        </>
      ) : (
        <>
          <strong>{visibleNames.join(', ')}</strong> ({others.length + 1} total).
        </>
      )}
    </p>
  )
}
