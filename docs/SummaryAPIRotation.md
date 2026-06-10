# Supabase API key rotation — follow-up notes

Quick reference for rotating the **service role / secret** key after it was exposed during bulk user import.

## What is **not** affected

| Area | Why |
|------|-----|
| **Live site (GitHub Pages)** | Built with `VITE_SUPABASE_ANON_KEY` only — never the service role key |
| **User logins** | Auth uses the anon key + user sessions |
| **GitHub Actions** | Uses `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — not the service role |
| **Database / migrations** | Unaffected |
| **Repo source code** | No service role key is committed |

**No codebase changes or web redeploy required** for service-role rotation alone.

## What **might** need a one-off update

### 1. Edge Functions

Functions (`sync-squads`, `sync-fixtures`, `sync-match-results`, `sync-match-odds`, `sync-tournament-awards`) read `SUPABASE_SERVICE_ROLE_KEY` at runtime. Supabase normally **injects the current project key automatically**.

**Exception:** If you manually set:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=old_key
```

that overrides the auto-injected value. After rotation:

- Remove that secret, **or**
- Set it again to the new key

Check: **Dashboard → Edge Functions → Secrets**.

### 2. Local / one-off scripts

`scripts/bulk-import-pool-users.mjs` — export the new key when running again. Nothing in git to change.

### 3. Saved credentials

Update password managers / notes where the old key was stored.

## Service role vs anon key (do not mix up)

| Key | Rotate impact |
|-----|----------------|
| **Service role / `sb_secret_…`** | App unaffected; check edge secrets + manual scripts |
| **Anon / publishable key** | Update GitHub secret `VITE_SUPABASE_ANON_KEY` and **re-run Deploy Web** |

## Recommended rotation steps

1. **Dashboard → Settings → API** → rotate/regenerate the **secret / service_role** key
2. **Edge Functions → Secrets** → confirm `SUPABASE_SERVICE_ROLE_KEY` is not pinned to the old value
3. Smoke-test one sync (see **Manual `sync-squads`** below)
4. Redeploy edge functions only if something still fails after updating/removing the manual secret

## Project reference

- Project ref: `fyiegingyipqtxaiopng`
- Base URL: `https://fyiegingyipqtxaiopng.supabase.co`
