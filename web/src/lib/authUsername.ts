/** Internal domain — not a real inbox; maps username → Supabase Auth email field. */
export const USERNAME_AUTH_EMAIL_DOMAIN = 'wc26.auth.local'

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return 'Username must be 3–20 characters: lowercase letters, numbers, and underscores only.'
  }
  return null
}

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${USERNAME_AUTH_EMAIL_DOMAIN}`
}

export function parseUsernameFromAuthEmail(email: string | undefined): string | null {
  if (!email) return null
  const suffix = `@${USERNAME_AUTH_EMAIL_DOMAIN}`
  if (!email.endsWith(suffix)) return null
  return email.slice(0, -suffix.length)
}
