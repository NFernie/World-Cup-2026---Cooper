# Demo summary — Prompt 004b (blank page fix)

**Timestamp (UTC):** 2026-06-03T06:30:00Z  
**Prompt:** Step 3 complete but live GitHub Pages URL shows blank page — review before prompt 005.

---

## Root cause

Playwright against https://nfernie.github.io/World-Cup-2026---Cooper/:

```text
pageerror: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
```

The production bundle was built with **empty** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from GitHub Actions (secrets missing or not set when deploy ran).

- `"" ?? 'placeholder'` does **not** use the fallback (`??` only applies to `null`/`undefined`).
- `@supabase/supabase-js` throws on init → React never renders → **blank page**.

**Not the issue:** JS/CSS 404 (assets load fine), router basename (secondary fix applied anyway).

---

## Fix applied (repo)

1. `web/src/lib/env.ts` — trim env vars; `isSupabaseConfigured` guard.
2. `web/src/components/ConfigErrorScreen.tsx` — visible error instead of blank screen.
3. `web/src/App.tsx` — router basename without trailing slash.
4. `.github/workflows/deploy-web.yml` — **fail build** if secrets missing/invalid.

---

## User action required (before prompt 005)

1. GitHub → **Settings → Secrets → Actions** — set:
   - `VITE_SUPABASE_URL` = `https://fyiegingyipqtxaiopng.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = anon key from Supabase → API
2. **Actions → Deploy Web (GitHub Pages) → Run workflow**
3. Hard-refresh live site (Ctrl+Shift+R)
4. Confirm home page loads (not blank, not config error)

---

## Prompt 005 gate

Do **not** start prompt 005 until live site shows the WC26 home screen and sign-in works.
