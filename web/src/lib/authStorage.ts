const PREFIX = 'wc26_verified_email:'

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

/** Remember this browser has completed sign-in for UX (optional). */
export function markEmailVerified(email: string) {
  localStorage.setItem(PREFIX + normalizeEmail(email), '1')
}
