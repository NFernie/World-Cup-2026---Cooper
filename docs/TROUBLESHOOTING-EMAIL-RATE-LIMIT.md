# Troubleshooting: "email rate limit exceeded"

This error comes from **Supabase Auth**, not the WC26 app. The built-in Supabase email service is for testing only.

## Why it happens

| Limit | Typical value |
|-------|----------------|
| Built-in SMTP (no custom SMTP) | **~2–4 emails per hour** for the whole project |
| Per-email OTP cooldown | **60 seconds** between requests to the same address |
| After custom SMTP | Starts at **30/hour** (configurable in dashboard) |

Repeated clicks on "Continue with email", join flows, and failed tests all count toward the limit.

## Immediate steps (you)

1. **Stop clicking** "Continue with email" — wait **at least 60 seconds** between tries.
2. If you already sent several today, wait **about 1 hour** for the hourly cap to reset.
3. Check **spam** for an earlier magic link — it may still work.
4. If you have an active session, go to the **home page** — you may already be signed in.

## Permanent fix (project owner)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. **Authentication** → **SMTP Settings** → enable **Custom SMTP**.
   - [Resend](https://resend.com), [SendGrid](https://sendgrid.com), or [AWS SES](https://aws.amazon.com/ses/) are common choices.
   - [Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)
3. **Authentication** → **Rate Limits** → increase:
   - **Email sends** (per hour)
   - **OTP / magic link** (per hour and per-email interval)
4. Ensure **Confirm email** is configured as you intend (first-time vs magic link).

## What we changed in the app

- **60-second client cooldown** before another request to the same email.
- Clearer error text with dashboard pointers.
- Login button shows **Wait Xs** during cooldown.

The app cannot bypass Supabase’s server-side hourly cap.

## Verify SMTP is working

After configuring custom SMTP, send **one** test login. Check **Authentication** → **Logs** in Supabase for delivery errors.

If you see **"Error sending magic link email"** (generic 500), see [TROUBLESHOOTING-MAGIC-LINK-EMAIL.md](./TROUBLESHOOTING-MAGIC-LINK-EMAIL.md). Resetting the user database does **not** fix that error.
