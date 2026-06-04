# Auth: username and password (no email)

## How it works

WC26 uses **Supabase email+password auth** with a **synthetic internal email** per username:

- Username `cooper_fc` → auth email `cooper_fc@wc26.auth.local`
- Users sign in with **username + password** only
- **No magic link, no confirmation email, no SMTP** when configured correctly

Public identity is stored in `profiles.username` (unique, case-insensitive).

Pool display names (`pool_members.display_name`) are chosen per pool when joining — separate from login username.

## Sign up / sign in

| Step | Behavior |
|------|----------|
| Sign up | Username 3–20 chars `[a-z0-9_]`, password ≥ 6 chars |
| Uniqueness | `is_username_available()` RPC + DB unique index |
| Sign in | Same username + password → immediate session |
| Email confirmation | **Must be OFF** (`enable_confirmations = false`) |

## Critical: avoid “email rate limit exceeded” (no custom SMTP)

Built-in Supabase mail sends **~2–4 emails/hour per project**. That limit applies only when Auth **actually sends email** (signup confirmation, magic link, password reset).

Username/password auth **must not send any email**. If you still see rate-limit errors:

| Cause | Fix |
|-------|-----|
| **Confirm email still ON** in hosted project | Dashboard → **Authentication** → **Providers** → **Email** → **Confirm email: OFF** |
| **`config.toml` had `enable_confirmations = true`** | Fixed in repo; run **Deploy Database Migrations** so `supabase config push` applies |
| **Old GitHub Pages bundle** (magic link UI) | Run **Deploy Web (GitHub Pages)** and hard-refresh |
| **Repeated sign-up clicks** | Wait 60s; use Sign in if the account already exists |

After a correct deploy, **sign-up and sign-in do not use the email quota** because no messages are sent.

### What we deploy from CI

1. `supabase/config.toml` → `enable_confirmations = false`, `double_confirm_changes = false`
2. `supabase config push` in `.github/workflows/deploy.yml`
3. Management API step sets `mailer_autoconfirm: true` (auto-confirm without mail)

### Manual verification (project owner)

1. **Authentication** → **Providers** → **Email** → Confirm email **disabled**
2. **Authentication** → **Logs** → sign up a test user → log should **not** show “confirmation email sent”
3. Login page shows **Username / Password**, not “magic link”

## Database

Migration `20260604000004_username_password_auth.sql`:

- `profiles.username` NOT NULL, unique on `lower(username)`
- `is_username_available(text)` for sign-up
- `handle_new_user` trigger sets username from metadata

## Super admin

```sql
update public.profiles
set is_super_admin = true
where username = 'your_username';
```

## Password reset

There is no “forgot password” flow in the app (it would require email). Admins can reset users in Supabase Dashboard → **Authentication** → **Users**.

## Security notes

- Usernames are public identifiers.
- Passwords are hashed by Supabase Auth.
- `@wc26.auth.local` is not a real mailbox.

## Related

- [DEPLOY-AUTH-USERNAME-CHECKLIST.md](./DEPLOY-AUTH-USERNAME-CHECKLIST.md) — deploy order
- [TROUBLESHOOTING-EMAIL-RATE-LIMIT.md](./TROUBLESHOOTING-EMAIL-RATE-LIMIT.md) — legacy magic-link / SMTP notes
