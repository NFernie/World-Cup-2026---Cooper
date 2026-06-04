import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { formatAuthError } from '@/lib/authErrors'
import { normalizeUsername, normalizeUsernameForAuth, usernameToAuthEmail } from '@/lib/authUsername'
import { supabase } from '@/lib/supabase'

export type AuthResult = {
  error: Error | null
}

type AuthContextValue = {
  user: User | null
  session: Session | null
  username: string | null
  loading: boolean
  isSuperAdmin: boolean
  checkUsernameAvailable: (username: string) => Promise<boolean>
  signIn: (username: string, password: string) => Promise<AuthResult>
  signUp: (username: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('username, is_super_admin')
      .eq('id', userId)
      .maybeSingle()

    setUsername(data?.username ?? null)
    setIsSuperAdmin(Boolean(data?.is_super_admin))
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) {
        void loadProfile(data.session.user.id)
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
      if (nextSession?.user) {
        void loadProfile(nextSession.user.id)
      } else {
        setUsername(null)
        setIsSuperAdmin(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkUsernameAvailable = async (raw: string): Promise<boolean> => {
    const name = normalizeUsername(raw)
    const { data, error } = await supabase.rpc('is_username_available', {
      p_username: name,
    })
    if (error) return false
    return Boolean(data)
  }

  const signIn = async (rawUsername: string, password: string): Promise<AuthResult> => {
    const name = normalizeUsername(rawUsername)
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToAuthEmail(normalizeUsernameForAuth(name)),
      password,
    })
    if (error) {
      return { error: new Error(formatAuthError(error.message)) }
    }
    return { error: null }
  }

  const signUp = async (rawUsername: string, password: string): Promise<AuthResult> => {
    const name = normalizeUsername(rawUsername)

    const available = await checkUsernameAvailable(name)
    if (!available) {
      return { error: new Error('That username is already taken. Try another.') }
    }

    const { data, error } = await supabase.auth.signUp({
      email: usernameToAuthEmail(normalizeUsernameForAuth(name)),
      password,
      options: {
        data: { username: normalizeUsername(name) },
      },
    })

    if (error) {
      return { error: new Error(formatAuthError(error.message)) }
    }

    if (!data.session) {
      return {
        error: new Error(
          'Account may have been created, but sign-in is blocked because Supabase still requires ' +
          'email confirmation. Turn off Confirm email (see docs/AUTH-USERNAME-PASSWORD.md).',
        ),
      }
    }

    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        username,
        loading,
        isSuperAdmin,
        checkUsernameAvailable,
        signIn,
        signUp,
        signOut,
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
