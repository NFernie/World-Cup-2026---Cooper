# Auth: no signup confirmation email

## What changed

**Confirm email** is disabled. New and returning users both get a single **magic link** email from `signInWithOtp` — not a separate “Confirm your email address” message on first signup.

After they click the link, they land on the home page and can host or join pools via invite URL as before.

Configured in:

- `supabase/config.toml` → `[auth.email]` → `enable_confirmations = false`
- CI: `supabase config push` in `.github/workflows/deploy.yml`

## What this does *not* do

| Expectation | Reality |
|-------------|---------|
| No emails at all | **Not possible** with magic-link / passwordless email auth. Every sign-in still sends **one** email with the link. |
| Bypass SMTP rate limits completely | Built-in Supabase mailer is still **~2–4 emails/hour** per project. Turning off confirmation avoids an extra *type* of email, not the magic link itself. |
| Skip clicking the link | Users must still open the email and click the link (or enter a 6-digit OTP if you switch the template). |

To scale beyond the built-in cap, re-enable **custom SMTP** (e.g. Resend) with a verified domain — see [TROUBLESHOOTING-EMAIL-RATE-LIMIT.md](./TROUBLESHOOTING-EMAIL-RATE-LIMIT.md).

## Apply on the hosted project

1. **Automatic:** merge to `main` so the Deploy workflow runs `supabase config push`.
2. **Manual (immediate):** Supabase Dashboard → **Authentication** → **Providers** → **Email** → turn **off** “Confirm email” (or “Enable email confirmations”).

Or locally after `supabase link`:

```bash
supabase config push --yes
```

## Verify

1. Use a **new** email address (or delete the test user in Dashboard → Authentication → Users).
2. Sign in once — you should receive **“Your sign-in link”** (magic link), not **“Confirm your email address”**.
3. Click the link → `/auth/callback` → home.

## If you need zero email in the future

That would require a different auth design (e.g. anonymous sign-in, or username/password without email). The current product uses **magic link (E1)** from `PLAN.md`; changing that is a larger feature request.
