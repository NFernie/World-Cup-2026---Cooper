import { Link } from 'react-router-dom'
import { PlusCircle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'

export function HomePage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-fifa-green/20 via-fifa-gold/10 to-transparent p-6 border border-fifa-green/30">
        <h1 className="text-2xl font-bold">World Cup 2026 tipping pool</h1>
        <p className="mt-2 text-[var(--muted)]">
          Get assigned a nation, earn odds-weighted points when they win, and climb two
          leaderboards — tournament standing and the underdog odds table.
        </p>
      </section>

      {!user ? (
        <Card>
          <CardTitle>Get started</CardTitle>
          <CardDescription className="mt-1">Sign in to host or join a pool.</CardDescription>
          <Button asChild className="mt-4">
            <Link to="/login">Sign in with magic link</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <PlusCircle className="h-8 w-8 text-fifa-green" />
            <CardTitle className="mt-2">Host a pool</CardTitle>
            <CardDescription className="mt-1">
              Create a competition and share your invite link on WhatsApp or email.
            </CardDescription>
            <Button asChild className="mt-4 w-full">
              <Link to="/pools/new">Create pool</Link>
            </Button>
          </Card>
          <Card>
            <Users className="h-8 w-8 text-fifa-gold" />
            <CardTitle className="mt-2">Join with invite</CardTitle>
            <CardDescription className="mt-1">
              Open the link your host sent — each pool has its own URL.
            </CardDescription>
            <p className="mt-4 text-xs text-[var(--muted)]">
              Example: /join/<code>your-invite-code</code>
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
