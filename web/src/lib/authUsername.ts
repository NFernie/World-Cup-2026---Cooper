/** Internal domain — not a real inbox; maps username → Supabase Auth email field. */
export const USERNAME_AUTH_EMAIL_DOMAIN = 'wc26.auth.local'

/** Display username: letters (any case), digits, underscore, hyphen, dot. */
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,24}$/

/** Auth email local-part must be lowercase. */
export function normalizeUsername(raw: string): string {
  return raw.trim()
}

export function normalizeUsernameForAuth(raw: string): string {
  return raw.trim().toLowerCase()
}

export function validateUsername(username: string): string | null {
  const name = normalizeUsername(username)
  if (!USERNAME_PATTERN.test(name)) {
    return 'Username must be 3–24 characters: letters, numbers, and _ . - only.'
  }
  return null
}

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsernameForAuth(username)}@${USERNAME_AUTH_EMAIL_DOMAIN}`
}

export function parseUsernameFromAuthEmail(email: string | undefined): string | null {
  if (!email) return null
  const suffix = `@${USERNAME_AUTH_EMAIL_DOMAIN}`
  if (!email.endsWith(suffix)) return null
  return email.slice(0, -suffix.length)
}
