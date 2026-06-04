const PREFIX = 'wc26_verified_email:'

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

/** Mark email as having completed first-time confirmation / sign-in. */
export function markEmailVerified(email: string) {
  localStorage.setItem(PREFIX + normalizeEmail(email), '1')
}

export function hasVerifiedEmailBefore(email: string): boolean {
  return localStorage.getItem(PREFIX + normalizeEmail(email)) === '1'
}
