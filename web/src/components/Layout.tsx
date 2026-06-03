import { Link, Outlet } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

export function Layout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-[var(--primary)]">
            <Trophy className="h-6 w-6 text-fifa-gold" />
            <span className="text-[var(--foreground)]">WC26</span>
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
