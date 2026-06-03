import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { signInWithMagicLink } = useAuth()
  const navigate = useNavigate()
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
    const redirect = sessionStorage.getItem('post_auth_redirect')
    if (redirect) navigate(redirect)
  }

  return (
    <Card className="mx-auto max-w-md border-fifa-green/30">
      <CardTitle className="text-fifa-green">Sign in with email</CardTitle>
      <CardDescription className="mt-1">
        We&apos;ll send a magic link — no password needed. Banter optional.
      </CardDescription>
      {sent ? (
        <p className="mt-4 text-sm text-[var(--muted)]">
          Check your inbox for the link. You can close this tab after clicking it.
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
  )
}
