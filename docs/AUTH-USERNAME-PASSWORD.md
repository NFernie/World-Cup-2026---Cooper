# Auth: username and password (no email)

## How it works

WC26 uses **Supabase email+password auth** with a **synthetic internal email** per username:

- Username `cooper_fc` → auth email `cooper_fc@wc26.auth.local`
- Users sign in with **username + password** only (no inbox, no magic link, no SMTP rate limits for login)

Public identity is stored in `profiles.username` with a **unique** constraint (case-insensitive).

Pool display names (`pool_members.display_name`) are still chosen per pool when joining — separate from login username.

## Sign up / sign in

| Step | Behavior |
|------|----------|
| Sign up | Username 3–20 chars `[a-z0-9_]`, password ≥ 6 chars, confirm password |
| Uniqueness | `is_username_available()` RPC + DB unique index |
| Sign in | Same username + password → immediate session |
| Email confirmation | **Off** (`enable_confirmations = false`) |

## Database

Migration `20260604000004_username_password_auth.sql`:

- `profiles.username` NOT NULL, unique on `lower(username)`
- `is_username_available(text)` — callable by anonymous users during sign-up
- `handle_new_user` trigger sets username from `raw_user_meta_data.username`

## Super admin

After sign-up, promote in SQL Editor:

```sql
update public.profiles
set is_super_admin = true
where username = 'your_username';
```

## Hosted project setup

1. Run migrations (`deploy.yml` on `main`).
2. Dashboard → **Authentication** → **Providers** → **Email**:
   - Email provider **enabled** (required for password auth)
   - **Confirm email** → **off**
3. Optional: `supabase config push` if using `config.toml` locally.

## Migrating from magic-link users

Existing accounts are backfilled to a username derived from their old email local-part. They must **set a password** via Dashboard → Authentication → Users (reset) or sign up a new username.

## Security notes

- Usernames are public identifiers (like many games/apps).
- Passwords are handled by Supabase Auth (hashed server-side).
- Synthetic `@wc26.auth.local` addresses are not real mailboxes.
