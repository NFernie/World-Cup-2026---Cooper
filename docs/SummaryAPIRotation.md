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

## Manual `sync-squads` (2025 domestic baselines)

Ratings refresh needs `force` + `includeRatings`. ~1 API call per **legacy** player (`api` / `fallback`); already-migrated `domestic_2025` rows are skipped so each re-run advances to new nations (e.g. Scotland / Robertson). Re-run until `ratingsBudgetReached` is absent and SQL counts stabilise.

**Timeout:** default internal budget is **4 minutes** (`API_FOOTBALL_SYNC_BUDGET_MS=240000`). In Supabase Dashboard → Edge Functions → `sync-squads` → increase **wall-clock timeout** (e.g. 300s) to match, or the platform may cut the run short before the budget is used.

**curl (reliable):**

```bash
curl -s -X POST "https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-squads" \
  -H "Content-Type: application/json" \
  -d '{"force":true,"includeRatings":true,"includePositions":true}'
```

**GET query string (no JSON body — works in browser or PowerShell):**

```
https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-squads?force=true&includeRatings=true&includePositions=true
```

**PowerShell — use a literal JSON string** (`ConvertTo-Json` + `Invoke-RestMethod` often sends an **empty body**, which triggers the 20h skip guard):

```powershell
$uri = "https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-squads"
$body = '{"force":true,"includeRatings":true,"includePositions":true}'
Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json; charset=utf-8" -Body $body
```

Run **ratings and positions separately** after deploy:

```
# Ratings only (after api/fallback cleared)
?force=true&includeRatings=true

# World Cup positions (recommended during tournament — no club API)
?force=true&includePositions=true&useWorldCupLineups=true

# Legacy club positions (pre-tournament only)
?force=true&includePositions=true
```

**WC position sync (`useWorldCupLineups=true`):**

- **Zero club API** — national team WC / season lineups only
- Only `position_code IS NULL` players
- **~4 API calls per nation** (fixtures + lineups), max **10 nations/run**
- National cache — re-runs cost 0 API for nations already fetched
- Daily cron (migration `20260618000028`) uses this mode automatically

**Theoretical API for ~650 null players:** ~48 nations × ~4 calls ≈ **~190 calls total** (~5–6 URL refreshes), vs **~650+** with club path.

**Legacy club position sync (pre-tournament):**

- Only queries players where `position_code IS NULL`
- **Club lineup cache** in `app_settings` (`spin_draft_position_cache`) — re-runs cost **0 API** for cached clubs
- **Max 5 new club API fetches per run** (~10 API calls total: 1 fixtures + 1 lineup per club)
- National friendlies **disabled by default** (add `allowNationalPositions=true` only if needed)

Run 1: ~10 API calls, codes ~50 players, caches 5 clubs.  
Run 2+: mostly cache hits — hundreds coded with ~10 API calls for 5 new clubs.

Daily cron (migration `20260618000027`) calls `includePositions` only — **0 API** once all players are positioned.

Manual bulk fill: re-run the URL until `pendingPositions` in the JSON response reaches 0.

Or open the GET URL in a browser (may take up to ~4 min per run).

Older deployments returned HTTP **500** even when ratings were syncing (Supabase logged `EDGE_FUNCTION_ERROR`). Check `withApiRating` in the JSON body; if it increases each run, progress is working.

Check the response `request` object: `bodyBytes: 0` with `skipped: true` means the POST body never arrived.

Verify Robertson after several runs:

```sql
select name, overall_rating, rating_source, position_code
from squad_players where api_football_player_id = 289;
```

Expect `rating_source = domestic_2025`, `overall_rating ≈ 67`.

## Project reference

- Project ref: `fyiegingyipqtxaiopng`
- Base URL: `https://fyiegingyipqtxaiopng.supabase.co`
