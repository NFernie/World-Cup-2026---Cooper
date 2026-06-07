import { Link } from 'react-router-dom'
import { LogIn, PlusCircle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { useUserPools } from '@/hooks/useUserPools'

export function HomePage() {
  const { user } = useAuth()
  const poolsQuery = useUserPools(user?.id)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-fifa-green/30 bg-gradient-to-br from-fifa-green/20 via-fifa-gold/10 to-transparent p-6">
        <h1 className="text-2xl font-bold">World Cup 2026 tipping pool</h1>
        <p className="mt-2 text-[var(--muted)]">
          Get assigned a nation per pool, earn odds-weighted points, and track fixtures live.
        </p>
      </section>

      {!user ? (
        <Card>
          <CardTitle>Sign in to your account</CardTitle>
          <CardDescription className="mt-1">
            Sign in with your username to access pools you host or have joined.
          </CardDescription>
          <Button asChild className="mt-4 w-full">
            <Link to="/login">
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>Your groups</span>
              <Button asChild size="sm" variant="outline">
                <Link to="/login">Account</Link>
              </Button>
            </CardTitle>
            {poolsQuery.isLoading && (
              <p className="mt-2 text-sm text-[var(--muted)]">Loading pools…</p>
            )}
            <div className="mt-3 space-y-2">
              {poolsQuery.data?.map((pool) => (
                <Link
                  key={pool.id}
                  to={`/pools/${pool.id}`}
                  className="block rounded-lg border border-[var(--border)] px-3 py-2 hover:bg-[var(--card)]"
                >
                  <div className="font-medium">{pool.name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {pool.isHost && 'Host · '}
                    {pool.teamName
                      ? `${pool.displayName} — ${pool.teamName}`
                      : pool.isHost
                        ? 'Tap to open (join as player if needed)'
                        : pool.displayName}
                  </div>
                </Link>
              ))}
              {!poolsQuery.isLoading && !poolsQuery.data?.length && (
                <p className="text-sm text-[var(--muted)]">
                  No pools yet — create one or join with an invite.
                </p>
              )}
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <PlusCircle className="h-8 w-8 text-fifa-green" />
              <CardTitle className="mt-2">Host a pool</CardTitle>
              <CardDescription className="mt-1">Create a competition and share the invite link.</CardDescription>
              <Button asChild className="mt-4 w-full">
                <Link to="/pools/new">Create pool</Link>
              </Button>
            </Card>
            <Card>
              <Users className="h-8 w-8 text-fifa-gold" />
              <CardTitle className="mt-2">Join a pool</CardTitle>
              <CardDescription className="mt-1">
                Use a group code or group name your host shared.
              </CardDescription>
              <Button asChild className="mt-4 w-full">
                <Link to="/join">Join with group code or name</Link>
              </Button>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
