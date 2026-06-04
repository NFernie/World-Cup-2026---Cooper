import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isRateLimitError } from '@/lib/authErrors'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { signInWithMagicLink, user, loading, getOtpCooldown } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (!email.trim()) return
    const tick = () => setCooldown(getOtpCooldown(email))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [email, getOtpCooldown, sent, submitting])

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cooldown > 0) return

    setSubmitting(true)
    setError(null)
    const { error: err, isFirstTime: first, cooldownSeconds } = await signInWithMagicLink(
      email.trim(),
    )
    setSubmitting(false)

    if (err) {
      setError(err.message)
      if (cooldownSeconds) setCooldown(cooldownSeconds)
      return
    }

    setIsFirstTime(first)
    setSent(true)
    setCooldown(getOtpCooldown(email.trim()))
  }

  const showRateLimitHelp = error && isRateLimitError(error)

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="border-fifa-green/30">
        <CardTitle className="text-fifa-green">Sign in to your account</CardTitle>
        <CardDescription className="mt-1">
          Use the same email for every pool you join. Only one email per minute.
        </CardDescription>
        {sent ? (
          <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            {isFirstTime ? (
              <>
                <p className="font-medium text-[var(--foreground)]">Confirm your email (first time)</p>
                <p>
                  We sent a confirmation link. Click it once to activate your account. If you
                  don&apos;t see it, check spam — and don&apos;t click &quot;Continue&quot; again
                  for 60 seconds.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-[var(--foreground)]">Check your email</p>
                <p>
                  Click the sign-in link to go straight to your pools. Wait at least 60 seconds
                  before requesting another link.
                </p>
              </>
            )}
            {cooldown > 0 && (
              <p className="text-xs text-amber-600">Resend available in {cooldown}s</p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={cooldown > 0}
              onClick={() => {
                setSent(false)
                setError(null)
              }}
            >
              Send to a different email
            </Button>
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
            {error && (
              <div className="space-y-2">
                <p className="text-sm text-red-600">{error}</p>
                {showRateLimitHelp && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-[var(--muted)]">
                    <p className="font-medium text-[var(--foreground)]">How to fix (project owner)</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-4">
                      <li>Supabase Dashboard → Authentication → SMTP → enable custom SMTP</li>
                      <li>Authentication → Rate Limits → increase email / OTP limits</li>
                      <li>Wait ~1 hour if using the default Supabase mailer (very low cap)</li>
                    </ol>
                  </div>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting || cooldown > 0}>
              {submitting
                ? 'Sending…'
                : cooldown > 0
                  ? `Wait ${cooldown}s`
                  : 'Continue with email'}
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
