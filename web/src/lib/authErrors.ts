/** User-facing auth errors (Supabase rate limits, etc.). */
export function formatAuthError(message: string): string {
  const lower = message.toLowerCase()

  if (
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('over_email_send_rate_limit') ||
    lower.includes('email rate limit exceeded')
  ) {
    return (
      'Email limit reached. Supabase’s built-in mailer only allows a few auth emails per hour ' +
      '(often 2–4). Wait about an hour, then try once. For production, set up custom SMTP under ' +
      'Supabase → Authentication → SMTP Settings, then raise limits under Authentication → Rate Limits.'
    )
  }

  if (lower.includes('email address not authorized')) {
    return (
      'This email cannot receive messages from the default Supabase mailer. Add custom SMTP, ' +
      'or use an email that is a member of your Supabase organization (testing only).'
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

export function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('over_email_send_rate_limit')
  )
}
