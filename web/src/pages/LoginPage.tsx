import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await signInWithMagicLink(email.trim())
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="border-fifa-green/30">
        <CardTitle className="text-fifa-green">Sign in to your account</CardTitle>
        <CardDescription className="mt-1">
          Use the email you joined with. We&apos;ll send a magic link — no password.
        </CardDescription>
        {sent ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Check your inbox for the link. After signing in you&apos;ll see all pools tied to this
            email.
          </p>
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send magic link'}
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
