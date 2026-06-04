# Deploy checklist: username/password auth

If the login page still shows **email / magic link**, the new web app has **not** been deployed yet.

## Three separate steps (all required)

| Step | What | How |
|------|------|-----|
| **1. Code on `main`** | Username login + migration file | Merge PR #4 (or ensure `main` includes username/password auth) |
| **2. Database + Supabase config** | `profiles.username`, `is_username_available`, `enable_confirmations = false` | Actions → **Deploy Database Migrations** (includes `db push` **and** `config push`) |
| **3. Web app (GitHub Pages)** | New Login UI in the browser | Actions → **Deploy Web (GitHub Pages)** — **separate workflow** |

Re-running **only** the migration workflow does **not** update the login page.

## Verify after deploy

1. Hard-refresh (Ctrl+Shift+R) or use a private window.
2. Login should show **Sign in / Sign up**, **Username**, **Password** — not Email / magic link.
3. Sign up should **not** send any email.

## If emails still send

Dashboard → **Authentication** → **Providers** → **Email** → **Confirm email: OFF**

## Check migration applied

Migrations list should include `20260604000004_username_password_auth`. Table `profiles` should have column `username`.
