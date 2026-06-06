import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type PoolHeaderTeam = {
  fifaCode?: string
  teamName?: string
}

const PoolHeaderTeamContext = createContext<{
  team: PoolHeaderTeam
  setTeam: (team: PoolHeaderTeam) => void
} | null>(null)

export function PoolHeaderTeamProvider({ children }: { children: React.ReactNode }) {
  const [team, setTeam] = useState<PoolHeaderTeam>({})
  const value = useMemo(() => ({ team, setTeam }), [team])
  return <PoolHeaderTeamContext.Provider value={value}>{children}</PoolHeaderTeamContext.Provider>
}

export function usePoolHeaderTeam() {
  return useContext(PoolHeaderTeamContext)?.team ?? {}
}

/** PoolShell sets the user's nation flag in the global WC26 header while viewing a pool. */
export function useSetPoolHeaderTeam(fifaCode?: string, teamName?: string) {
  const ctx = useContext(PoolHeaderTeamContext)
  const setTeam = ctx?.setTeam
  useEffect(() => {
    if (!setTeam) return
    setTeam({ fifaCode, teamName })
    return () => setTeam({})
  }, [setTeam, fifaCode, teamName])
}
