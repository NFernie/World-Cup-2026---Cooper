import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'

/** Refetch match-driven UI when sync-match-results (or admin) updates the database. */
export function useMatchSyncRealtime(enabled = true) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return

    const invalidateMatchQueries = () => {
      void queryClient.invalidateQueries({ queryKey: ['pool-live-matches'] })
      void queryClient.invalidateQueries({ queryKey: ['fixtures-full'] })
      void queryClient.invalidateQueries({ queryKey: ['world-cup-table'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard-tournament'] })
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'next-team-match',
      })
    }

    const channel = supabase
      .channel('match-sync-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        invalidateMatchQueries,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_events' },
        invalidateMatchQueries,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams' },
        invalidateMatchQueries,
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, queryClient])
}
