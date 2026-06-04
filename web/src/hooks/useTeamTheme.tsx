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
    root.style.setProperty(
      '--pool-bg',
      `linear-gradient(165deg, color-mix(in srgb, ${theme.primary} 22%, var(--background)) 0%, color-mix(in srgb, ${theme.secondary} 12%, var(--background)) 45%, var(--background) 85%)`,
    )
    return () => {
      root.style.removeProperty('--team-primary')
      root.style.removeProperty('--team-secondary')
      root.style.removeProperty('--pool-bg')
      root.style.setProperty('--primary', '#00a651')
    }
  }, [theme.primary, theme.secondary])

  return (
    <TeamThemeContext.Provider value={theme}>
      <div className="pool-theme-shell min-h-full">{children}</div>
    </TeamThemeContext.Provider>
  )
}

export function useTeamTheme() {
  return useContext(TeamThemeContext)
}
