import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getAuthRedirectUrl } from '@/lib/authRedirect'
import { formatAuthError, isRateLimitError } from '@/lib/authErrors'
import { canSendOtp, getOtpCooldownSeconds, recordOtpSent } from '@/lib/authOtpCooldown'
import { hasVerifiedEmailBefore, markEmailVerified } from '@/lib/authStorage'
import { supabase } from '@/lib/supabase'

export type SignInResult = {
  error: Error | null
  isFirstTime: boolean
  cooldownSeconds?: number
}

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  isSuperAdmin: boolean
  signInWithMagicLink: (email: string) => Promise<SignInResult>
  signOut: () => Promise<void>
  getOtpCooldown: (email: string) => number
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user?.email) markEmailVerified(data.session.user.email)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
      if (nextSession?.user?.email && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        markEmailVerified(nextSession.user.email)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setIsSuperAdmin(false)
      return
    }
    supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setIsSuperAdmin(Boolean(data?.is_super_admin)))
  }, [user])

  const signInWithMagicLink = async (email: string): Promise<SignInResult> => {
    const normalized = email.trim().toLowerCase()
    const isFirstTime = !hasVerifiedEmailBefore(normalized)

    const cooldownSeconds = getOtpCooldownSeconds(normalized)
    if (!canSendOtp(normalized)) {
      return {
        error: new Error(`Please wait ${cooldownSeconds} seconds before requesting another email.`),
        isFirstTime,
        cooldownSeconds,
      }
    }

    const emailRedirectTo = getAuthRedirectUrl()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
      },
    })

    if (error) {
      const msg = error.message ?? 'Sign-in failed'
      if (!isRateLimitError(msg)) {
        recordOtpSent(normalized)
      }
      return {
        error: new Error(formatAuthError(msg)),
        isFirstTime,
      }
    }

    recordOtpSent(normalized)
    return { error: null, isFirstTime }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isSuperAdmin,
        signInWithMagicLink,
        signOut,
        getOtpCooldown: getOtpCooldownSeconds,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
