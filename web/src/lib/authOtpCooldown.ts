const COOLDOWN_MS = 60_000 // Matches Supabase default per-email OTP window
const STORAGE_PREFIX = 'wc26_otp_sent:'

function key(email: string) {
  return STORAGE_PREFIX + email.trim().toLowerCase()
}

export function recordOtpSent(email: string) {
  localStorage.setItem(key(email), String(Date.now()))
}

/** Seconds until another magic-link request is allowed (client guard). */
export function getOtpCooldownSeconds(email: string): number {
  const raw = localStorage.getItem(key(email))
  if (!raw) return 0
  const elapsed = Date.now() - Number(raw)
  const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000)
  return remaining > 0 ? remaining : 0
}

export function canSendOtp(email: string): boolean {
  return getOtpCooldownSeconds(email) <= 0
}
