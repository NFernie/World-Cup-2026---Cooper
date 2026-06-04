import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { validateUsername } from '@/lib/authUsername'
import { useAuth } from '@/hooks/useAuth'

type Mode = 'signin' | 'signup'

export function LoginPage() {
  const { signIn, signUp, checkUsernameAvailable, user, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const name = username.trim()
    const usernameError = validateUsername(name)
    if (usernameError) {
      setError(usernameError)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }

      setSubmitting(true)
      const available = await checkUsernameAvailable(name)
      if (!available) {
        setSubmitting(false)
        setError('That username is already taken. Try another.')
        return
      }

      const { error: err } = await signUp(name, password)
      setSubmitting(false)
      if (err) {
        setError(err.message)
        return
      }
      return
    }

    setSubmitting(true)
    const { error: err } = await signIn(name, password)
    setSubmitting(false)
    if (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="border-fifa-green/30">
        <CardTitle className="text-fifa-green">
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </CardTitle>
        <CardDescription className="mt-1">
          {mode === 'signin'
            ? 'Use your username and password. Same account for every pool.'
            : 'Pick a unique username (3–20 characters). No email required.'}
        </CardDescription>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'signin' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => {
              setMode('signin')
              setError(null)
            }}
          >
            Sign in
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'signup' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => {
              setMode('signup')
              setError(null)
            }}
          >
            Sign up
          </Button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              required
              autoComplete="username"
              placeholder="e.g. cooper_fc"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs text-[var(--muted)]">Letters, numbers, underscores only.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting
              ? mode === 'signup'
                ? 'Creating account…'
                : 'Signing in…'
              : mode === 'signup'
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-[var(--muted)]">
        <Link to="/" className="underline">
          Back to home
        </Link>
      </p>
    </div>
  )
}
