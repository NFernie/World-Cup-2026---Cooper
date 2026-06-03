import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { getTeamTheme, type TeamTheme } from '@/lib/teamColors'

const TeamThemeContext = createContext<TeamTheme | null>(null)

export function TeamThemeProvider({
  fifaCode,
  children,
}: {
  fifaCode: string | null | undefined
  children: ReactNode
}) {
  const theme = getTeamTheme(fifaCode)

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--primary', theme.primary)
    root.style.setProperty('--team-primary', theme.primary)
    root.style.setProperty('--team-secondary', theme.secondary)
    return () => {
      root.style.removeProperty('--team-primary')
      root.style.removeProperty('--team-secondary')
      root.style.setProperty('--primary', '#00a651')
    }
  }, [theme.primary, theme.secondary])

  return <TeamThemeContext.Provider value={theme}>{children}</TeamThemeContext.Provider>
}

export function useTeamTheme() {
  return useContext(TeamThemeContext)
}
