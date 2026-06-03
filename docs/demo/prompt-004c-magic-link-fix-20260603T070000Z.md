# Demo summary — Prompt 004c (magic link fix)

**Timestamp (UTC):** 2026-06-03T07:00:00Z  
**Issue:** Magic link sign-in → `Failed to execute 'fetch' on 'Window': Invalid value`

---

## Root cause

`emailRedirectTo` used `window.location.origin + '/auth/callback'`:

- **Wrong:** `https://nfernie.github.io/auth/callback`
- **Correct:** `https://nfernie.github.io/World-Cup-2026---Cooper/auth/callback`

On GitHub Pages project sites, the app is **not** at the domain root. Wrong redirect URL can make Supabase Auth issue invalid requests → browser `fetch` TypeError.

---

## Fix

- `web/src/lib/authRedirect.ts` — `getAuthRedirectUrl()` includes router basename / repo path
- Stricter `VITE_SUPABASE_URL` validation (must be `https://*.supabase.co`)
- Supabase `config.toml` + dashboard: allow explicit `/auth/callback` URL

---

## User checklist after redeploy

1. Re-run **Deploy Web (GitHub Pages)** workflow
2. Supabase → **Authentication** → **URL configuration** → Redirect URLs must include:
   - `https://nfernie.github.io/World-Cup-2026---Cooper/**`
   - `https://nfernie.github.io/World-Cup-2026---Cooper/auth/callback`
3. Test magic link from live `/login` page

---

## Prompt 005 gate

Still blocked until magic link completes end-to-end on production URL.
