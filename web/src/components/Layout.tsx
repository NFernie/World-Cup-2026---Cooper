import { Link, Outlet } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { TeamFlag } from '@/components/TeamFlag'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/hooks/useAuth'
import { usePoolHeaderTeam } from '@/hooks/usePoolHeaderTeam'
import { Button } from '@/components/ui/button'

export function Layout() {
  const { user, signOut } = useAuth()
  const { fifaCode, teamName } = usePoolHeaderTeam()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--card)]/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2.5 font-semibold tracking-tight text-[var(--primary)]"
          >
            <Trophy className="h-6 w-6 shrink-0 text-fifa-gold" aria-hidden />
            <span className="text-[var(--foreground)]">WC26</span>
            {fifaCode && (
              <span
                className="ml-0.5 flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] px-2 py-0.5 text-xs font-medium text-[var(--foreground)]"
                title={teamName ? `Your team: ${teamName}` : undefined}
              >
                <TeamFlag fifaCode={fifaCode} size={20} className="!h-3 !w-[18px]" />
                <span className="max-w-[5rem] truncate sm:max-w-[8rem]">{teamName}</span>
              </span>
            )}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user && (
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                Sign out
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
