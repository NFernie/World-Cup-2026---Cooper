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

  if (
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('over_email_send_rate_limit') ||
    lower.includes('email rate limit exceeded')
  ) {
    return (
      'Supabase email rate limit hit. Username/password sign-up should not send email — ' +
      'your project likely still has Confirm email enabled. The project owner should run ' +
      'Deploy Database Migrations (config push) or turn off Confirm email under ' +
      'Authentication → Providers → Email. See docs/AUTH-USERNAME-PASSWORD.md.'
    )
  }

  if (lower.includes('error sending confirmation') || lower.includes('error sending magic link')) {
    return (
      'Supabase tried to send a confirmation email and failed. Turn off Confirm email for ' +
      'username/password auth (Dashboard → Authentication → Providers → Email).'
    )
  }

  if (
    lower.includes('error sending magic link') ||
    lower.includes('error sending confirmation') ||
    lower.includes('error sending invite') ||
    lower.includes('error sending recovery')
  ) {
    return (
      'Supabase could not send the sign-in email (mail server problem). This is not fixed by resetting the ' +
      'database. Check Supabase → Authentication → Logs for the real error, then fix SMTP under ' +
      'Authentication → SMTP Settings (custom SMTP + verified sender domain). See docs/TROUBLESHOOTING-MAGIC-LINK-EMAIL.md.'
    )
  }

  return message
}
