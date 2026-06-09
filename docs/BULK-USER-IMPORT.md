# Bulk user import (CSV → auth + pool)

Script: `scripts/bulk-import-pool-users.mjs`

## Run (project owner)

```bash
cd /workspace/web   # uses @supabase/supabase-js from web/node_modules

export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."   # Dashboard → Settings → API → service_role

node ../scripts/bulk-import-pool-users.mjs \
  --csv "/path/to/WC26_SantosSweep1_Users_c8d9.csv" \
  --pool "Santos 2026 WC Sweep 1 \$10-"
```

Dry run (no writes):

```bash
node ../scripts/bulk-import-pool-users.mjs --dry-run --csv "..." --pool "..."
```

## What it does

| Field | Source |
|-------|--------|
| Login username | Derived from Password column (surname), lowercased; suffix `2`, `3`… on collision |
| Auth email | `{username}@wc26.auth.local` |
| Password | CSV Password column |
| Pool display name | CSV Name column (full name) |
| Pool membership | Inserts `pool_members` with auto team assignment if pool mode is `automatic` |

## Password format

Supabase requires **passwords ≥ 6 characters**. For surname-only passwords, append `2026` (e.g. `Lane2026`). Usernames are derived from the surname **without** the `2026` suffix (e.g. login `lane`, password `Lane2026`).

**Santos Sweep 1 (June 2026):** 47 members imported — 46 new accounts created, Richard Fernie (host) already in the pool.

### 2. Username vs display name

Users sign in with **username**, not full name. The script uses the surname (Password column) as the login username (e.g. `fernie`, `ballard`). Full name is only shown in the pool as `display_name`.

Short surnames get a fallback (`belle_yu` for Belle Yu).

### 3. Pool name must match exactly

Pool lookup is **exact** on `pools.name`: `Santos 2026 WC Sweep 1 $10-` (including `$` and trailing `-`). A typo or extra space will fail.

### 4. Existing users

If a username already exists, the script reuses that profile and only adds pool membership (skips auth create).

### 5. Group size / join lock

If the pool has `join_locked` and already has members, total headcount above **48** may block further joins per `join_pool` rules. This script inserts via service role (bypasses RPC), but the host may still want to unlock or confirm capacity.

### 6. Team assignment mode

- `automatic`: each member gets a random unassigned nation via `assign_team_for_pool_member`.
- `host`: members join with `assigned_team_id = null` until the host assigns teams.

### 7. Security

Never commit or expose `SUPABASE_SERVICE_ROLE_KEY`. Run locally or in a trusted CI job only.
