import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { markEmailVerified } from '@/lib/authStorage'
import { supabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const finish = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user?.email) {
        markEmailVerified(data.session.user.email)
      }

      const redirect = sessionStorage.getItem('post_auth_redirect')
      sessionStorage.removeItem('post_auth_redirect')

      // Returning users: go straight to landing (or intended join path)
      navigate(redirect && redirect !== '/login' ? redirect : '/', { replace: true })
    }

    void finish()
  }, [navigate])

  return <p className="text-center text-[var(--muted)]">Signing you in…</p>
}
