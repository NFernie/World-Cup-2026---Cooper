/** Trim and treat empty GitHub Actions secrets as missing ("" fails Supabase URL validation). */
function readEnv(value: string | undefined): string {
  let v = value?.trim() ?? ''
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim()
  }
  return v
}

export const supabaseUrl = readEnv(import.meta.env.VITE_SUPABASE_URL)
export const supabaseAnonKey = readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

function isValidSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co')
  } catch {
    return false
  }
}

export const isSupabaseConfigured =
  supabaseUrl.length > 0 &&
  supabaseAnonKey.length > 20 &&
  isValidSupabaseUrl(supabaseUrl)

export function getConfigError(): string | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. For GitHub Pages, set both as repository secrets and re-run the Deploy Web workflow.'
  }
  if (!isValidSupabaseUrl(supabaseUrl)) {
    return `Invalid VITE_SUPABASE_URL: "${supabaseUrl}". Use your Project URL exactly, e.g. https://fyiegingyipqtxaiopng.supabase.co`
  }
  return null
}

/** React Router basename: Vite BASE_URL has a trailing slash; Router expects none. */
export function getRouterBasename(): string {
  const base = import.meta.env.BASE_URL
  if (!base || base === '/') return '/'
  return base.endsWith('/') ? base.slice(0, -1) : base
}
