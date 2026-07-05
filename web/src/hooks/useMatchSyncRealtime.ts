import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'

/** Collapse burst realtime events (e.g. 48 team updates) into one refetch batch. */
const INVALIDATE_DEBOUNCE_MS = 5_000

/** Refetch match-driven UI when sync-match-results (or admin) updates the database. */
export function useMatchSyncRealtime(enabled = true) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return

    let matchTimer: ReturnType<typeof setTimeout> | null = null
    let standingsTimer: ReturnType<typeof setTimeout> | null = null

    const invalidateMatchDrivenQueries = () => {
      void queryClient.invalidateQueries({ queryKey: ['pool-live-matches'] })
      void queryClient.invalidateQueries({ queryKey: ['fixtures-full'] })
      void queryClient.invalidateQueries({ queryKey: ['world-cup-table'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard-tournament'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard-golden-boot'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard-golden-glove'] })
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'next-team-match',
      })
    }

    const invalidateStandingsQueries = () => {
      void queryClient.invalidateQueries({ queryKey: ['leaderboard-tournament'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard-golden-boot'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard-golden-glove'] })
      void queryClient.invalidateQueries({ queryKey: ['world-cup-table'] })
    }

    const scheduleMatchInvalidation = () => {
      if (matchTimer) clearTimeout(matchTimer)
      matchTimer = setTimeout(() => {
        matchTimer = null
        invalidateMatchDrivenQueries()
      }, INVALIDATE_DEBOUNCE_MS)
    }

    const scheduleStandingsInvalidation = () => {
      if (standingsTimer) clearTimeout(standingsTimer)
      standingsTimer = setTimeout(() => {
        standingsTimer = null
        invalidateStandingsQueries()
      }, INVALIDATE_DEBOUNCE_MS)
    }

    const channel = supabase
      .channel('match-sync-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        scheduleMatchInvalidation,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_events' },
        scheduleMatchInvalidation,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams' },
        scheduleStandingsInvalidation,
      )
      .subscribe()

    return () => {
      if (matchTimer) clearTimeout(matchTimer)
      if (standingsTimer) clearTimeout(standingsTimer)
      void supabase.removeChannel(channel)
    }
  }, [enabled, queryClient])
}
