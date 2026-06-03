# Deployment checklist

Use this after reviewing failed GitHub Actions runs.

## Workflow files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | Push SQL migrations to Supabase on `main` |
| `.github/workflows/deploy-web.yml` | Build React app and deploy to GitHub Pages |

Both run on every push to `main`.

---

## 1. Deploy Database Migrations (`deploy.yml`)

### Required GitHub secrets

Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Where to get it |
|--------|-----------------|
| `SUPABASE_ACCESS_TOKEN` | [Account tokens](https://supabase.com/dashboard/account/tokens) — create token with project access |
| `SUPABASE_DB_PASSWORD` | Password you set when creating the Supabase project (not the anon key) |

### Common errors (fixed in repo)

| Error | Cause | Fix |
|-------|--------|-----|
| `invalid keys: project` | Old `[project]` block in `supabase/config.toml` | Use `project_id = "..."` (already fixed) |
| `Unrecognized flag: --method` | Removed in CLI v2 | Use `supabase db push --linked` |
| `Invalid access token` | Missing/wrong secret | Add `SUPABASE_ACCESS_TOKEN` |
| `password authentication failed` | Wrong DB password | Reset in Supabase → Database settings if needed |

### Verify locally

```bash
cd /path/to/World-Cup-2026---Cooper
npx supabase login
npx supabase link --project-ref fyiegingyipqtxaiopng
npx supabase db push --linked
```

---

## 2. Deploy Web — GitHub Pages (`deploy-web.yml`)

### Enable Pages (required — fixes 404 on deploy)

1. GitHub repo → **Settings** → **Pages**
2. **Build and deployment** → Source: **GitHub Actions** (not “Deploy from branch”)
3. Save

Without this step you get:

```text
Error: Failed to create deployment (status: 404)
Ensure GitHub Pages has been enabled
```

### Required GitHub secrets

| Secret | Where to get it |
|--------|-----------------|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Same page → `anon` `public` key |

### Supabase Auth redirect URLs

Authentication → URL configuration → add:

- `http://localhost:5173/**` (local dev)
- `https://nfernie.github.io/World-Cup-2026---Cooper/**` (production Pages)

### After successful deploy

Site URL: `https://nfernie.github.io/World-Cup-2026---Cooper/`

---

## 3. After migrations — one-time in Supabase

Run in **SQL Editor** after you sign in to the app once:

```sql
update public.profiles
set is_super_admin = true
where email = 'your-email@example.com';
```

---

## 4. Optional: API-Football edge functions

Not part of GitHub Actions yet. Deploy manually:

```bash
supabase secrets set API_FOOTBALL_KEY=...
supabase functions deploy sync-match-results
supabase functions deploy sync-match-odds
```

---

## Quick status check

```bash
gh run list --repo NFernie/World-Cup-2026---Cooper --limit 5
gh run view <run-id> --log-failed
```
