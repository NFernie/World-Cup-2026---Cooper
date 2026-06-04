/** User-facing auth errors from Supabase Auth. */
export function formatAuthError(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('invalid login credentials')) {
    return 'Wrong username or password.'
  }

  if (
    lower.includes('user already registered') ||
    lower.includes('already been registered') ||
    lower.includes('username already taken')
  ) {
    return 'That username is already taken. Try another or sign in.'
  }

  if (lower.includes('password should be at least')) {
    return 'Password must be at least 6 characters.'
  }

  if (lower.includes('signup is disabled')) {
    return 'New sign-ups are disabled. Contact the pool admin.'
  }

  return message
}
