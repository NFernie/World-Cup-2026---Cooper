# Demo summary — Prompt 004

**Timestamp (UTC):** 2026-06-03T06:10:33Z  
**Prompt:** Confirm Supabase setup (step 1) complete; review status; proceed with next steps; summarise Supabase inputs.

---

## Prompt 004 summary

User completed **Step 1 — Supabase setup** (database migrations via GitHub Actions). Agent verified CI success, confirmed migrations linked to project `fyiegingyipqtxaiopng`, and directed user to **Steps 2–4** (Auth redirects, super-admin, local env, first app smoke test).

---

## Inputs required for Supabase setup

Use this as a checklist for demos or re-runs.

### A. Supabase cloud project

| Input | Description | Example / where |
|-------|-------------|-----------------|
| **Supabase account** | Dashboard login | https://supabase.com |
| **Project name** | Human-readable label | `world-cup-2026-cooper` |
| **Project ref** | Reference ID (subdomain) | `fyiegingyipqtxaiopng` |
| **Database password** | Set at project creation | Stored securely; used for `link` / CI |
| **Region** | Hosting region | e.g. Sydney / US East |

### B. API keys (Project Settings → API)

| Input | Used for | Format |
|-------|----------|--------|
| **Project URL** | Frontend `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| **anon public key** | Frontend `VITE_SUPABASE_ANON_KEY` | JWT `eyJ...` |
| **service_role key** | Edge functions only (never in frontend) | JWT `eyJ...` |

### C. Personal access token (account-level)

| Input | Used for | Format |
|-------|----------|--------|
| **SUPABASE_ACCESS_TOKEN** | GitHub Actions `supabase link` / `db push` | `sbp_...` from https://supabase.com/dashboard/account/tokens |

**Not valid for CI:** anon key, service_role key, or DB password in place of `sbp_` token.

### D. GitHub Actions secrets

| Secret name | Maps to |
|-------------|---------|
| `SUPABASE_ACCESS_TOKEN` | `sbp_...` token |
| `SUPABASE_DB_PASSWORD` | Database password |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |

### E. Repo / CLI (already in project)

| Item | Location |
|------|----------|
| Migrations | `supabase/migrations/*.sql` (3 files) |
| Config | `supabase/config.toml` (`project_id`, auth URLs) |
| Workflow | `.github/workflows/deploy.yml` |
| Project ref in workflow | `fyiegingyipqtxaiopng` |

### F. Auth URL configuration (dashboard)

| URL | Purpose |
|-----|---------|
| `http://localhost:5173/**` | Local dev magic link return |
| `https://nfernie.github.io/World-Cup-2026---Cooper/**` | GitHub Pages production |

---

## Verification (step 1 complete when all true)

- [x] **Deploy Database Migrations** workflow: **success** (run `26866221496`, 2026-06-03)
- [x] Log shows `Finished supabase link`
- [x] `supabase db push --linked` completed without error
- [ ] Optional: In Supabase **Table Editor** — tables `teams`, `pools`, `pool_members`, `matches`, etc. exist
- [ ] Optional: **48 rows** in `teams` from seed migration

---

## Next steps (after step 1)

### Step 2 — Web deploy (likely done)

- [x] GitHub Pages source = **GitHub Actions**
- [x] **Deploy Web (GitHub Pages)** workflow: **success** (run `26866273081`)
- **Live URL:** https://nfernie.github.io/World-Cup-2026---Cooper/

### Step 3 — Auth & super-admin (do now)

1. Supabase → **Authentication** → confirm redirect URLs (section F above).
2. Open live or local app → **Sign in** with magic link (your email).
3. SQL Editor:

```sql
update public.profiles
set is_super_admin = true
where email = 'YOUR_EMAIL@example.com';
```

### Step 4 — Local dev (optional)

```bash
cd web
cp .env.example .env.local
# VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install && npm run dev
```

### Step 5 — First use

1. Create a pool → copy invite link.
2. Join (second browser/incognito) → confirm team assignment + co-manager message.
3. Visit `/admin` as super-admin (from pool page).

### Step 6 — Later (tournament data)

- Seed `matches` + `match_odds` or deploy API-Football edge functions.
- See `docs/DEPLOYMENT-CHECKLIST.md` §4.

---

## How to re-run prompt 004 in a demo

1. Show GitHub Actions: both workflows green.
2. Show Supabase Table Editor: schema + 48 teams.
3. Walk through inputs table (section above).
4. Execute steps 3–5 live (sign-in, super-admin SQL, create pool).

---

## Related docs

- `docs/DEPLOYMENT-CHECKLIST.md`
- `docs/demo/prompt-003-implement-plan-20260603T040747Z.md`
