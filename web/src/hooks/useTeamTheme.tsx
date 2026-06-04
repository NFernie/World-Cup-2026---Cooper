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
      `linear-gradient(165deg, color-mix(in srgb, ${theme.primary} 42%, var(--background)) 0%, color-mix(in srgb, ${theme.secondary} 28%, var(--background)) 40%, color-mix(in srgb, ${theme.primary} 12%, var(--background)) 100%)`,
    )
    root.style.setProperty(
      '--pool-accent-border',
      `color-mix(in srgb, ${theme.primary} 55%, transparent)`,
    )
    return () => {
      root.style.removeProperty('--team-primary')
      root.style.removeProperty('--team-secondary')
      root.style.removeProperty('--pool-bg')
      root.style.removeProperty('--pool-accent-border')
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
