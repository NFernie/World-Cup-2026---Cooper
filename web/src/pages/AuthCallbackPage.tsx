import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(() => {
      const redirect = sessionStorage.getItem('post_auth_redirect') ?? '/'
      sessionStorage.removeItem('post_auth_redirect')
      navigate(redirect, { replace: true })
    })
  }, [navigate])

  return <p className="text-center text-[var(--muted)]">Signing you in…</p>
}
