import { createClient } from '@supabase/supabase-js'
import { getConfigError, isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/env'

const configError = getConfigError()

if (configError) {
  console.error(configError)
}

export const supabaseConfigError = configError

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-key-not-used',
)
