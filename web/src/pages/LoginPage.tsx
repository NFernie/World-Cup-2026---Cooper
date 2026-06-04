import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { signInWithMagicLink, user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      // Already signed in — straight to landing
    }
  }, [user, loading])

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: err, isFirstTime: first } = await signInWithMagicLink(email.trim())
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    setIsFirstTime(first)
    setSent(true)
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="border-fifa-green/30">
        <CardTitle className="text-fifa-green">Sign in to your account</CardTitle>
        <CardDescription className="mt-1">
          Use the same email for every pool you join.
        </CardDescription>
        {sent ? (
          <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            {isFirstTime ? (
              <>
                <p className="font-medium text-[var(--foreground)]">Confirm your email (first time)</p>
                <p>
                  We sent a confirmation link. Click it once to activate your account, then you can
                  join pools.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-[var(--foreground)]">Check your email</p>
                <p>
                  Click the sign-in link and you&apos;ll go straight to your pools — no extra
                  confirmation needed.
                </p>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Sending…' : 'Continue with email'}
            </Button>
          </form>
        )}
      </Card>
      <p className="text-center text-sm text-[var(--muted)]">
        <Link to="/" className="underline">
          Back to home
        </Link>
      </p>
    </div>
  )
}
