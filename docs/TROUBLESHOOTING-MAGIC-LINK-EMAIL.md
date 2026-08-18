# Troubleshooting: "Error sending magic link email"

This message comes from **Supabase Auth** when it cannot deliver the OTP/magic-link email. It is **not** caused by bad rows in `profiles`, `pool_members`, or other app tables.

## Do you need to reset the user database?

**No.** Resetting or truncating `auth.users` / `profiles` will not fix mail delivery. You would only wipe accounts and force everyone to sign up again.

Use a database reset only if you intentionally want a clean slate during development — never as a fix for email errors.

## What actually causes this error

Supabase returns a generic 500 when the mailer fails. Common causes:

| Cause | What to do |
|-------|------------|
| **Built-in SMTP still enabled** (testing mailer) | Hourly cap (~2–4 emails/project). Wait ~1 hour or configure **custom SMTP**. See [TROUBLESHOOTING-EMAIL-RATE-LIMIT.md](./TROUBLESHOOTING-EMAIL-RATE-LIMIT.md). |
| **Custom SMTP misconfigured** | Re-check host, port (usually **587**), username, password. No trailing spaces in the host field. Sender address must be on a **verified domain** at your provider (Resend, SendGrid, etc.). |
| **Provider rejected the send** | Open your SMTP provider’s activity/delivery log for the real reason (unverified sender, sandbox mode, auth failure). |
| **Email not allowed on default mailer** | Built-in mailer may only send to **Supabase org team members**. Use custom SMTP for real users. |
| **Rate limits** | Dashboard → **Authentication** → **Rate Limits** — raise email/OTP limits after SMTP is set up. |

Redirect URL / Site URL problems usually break the **link inside** the email, not sending the email itself. Still verify:

- **Authentication** → **URL Configuration** → **Site URL** matches your deployed app (e.g. `https://nfernie.github.io/World-Cup-2026---Cooper/`)
- **Redirect URLs** include your auth callback, e.g. `https://nfernie.github.io/World-Cup-2026---Cooper/auth/callback`

## Find the real error (project owner)

1. [Supabase Dashboard](https://supabase.com/dashboard) → your project (`fyiegingyipqtxaiopng`).
2. **Authentication** → **Logs** (or **Logs** → filter Auth).
3. Open the failed `signInWithOtp` / magic-link attempt — the log often shows SMTP timeout, `535 Authentication failed`, DNS lookup failure, etc.

That detail matters more than the generic UI message.

## Fix checklist

1. **Authentication** → **SMTP Settings** → enable **Custom SMTP** with a production provider.
2. Add **SPF / DKIM / DMARC** DNS records from your provider so messages are not dropped or spam-foldered.
3. **Authentication** → **Rate Limits** → increase email sends after SMTP works.
4. Send **one** test login; wait **60 seconds** between retries (app enforces this too).
5. Check spam for an email that may have been sent before the failure.

## Related

- [TROUBLESHOOTING-EMAIL-RATE-LIMIT.md](./TROUBLESHOOTING-EMAIL-RATE-LIMIT.md) — hourly cap and cooldown
- [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
