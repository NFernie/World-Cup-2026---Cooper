# Test plan — live API-Football updates

Use this checklist after:

- Supabase migrations through **`20260607000007`** are applied
- The web app is deployed (GitHub Pages)
- Edge functions are deployed with **exact names** (see [Step 0](#step-0--edge-functions-exist-and-are-named-correctly))

Related: [supabase/functions/DASHBOARD-DEPLOY.md](../supabase/functions/DASHBOARD-DEPLOY.md) (browser copy/paste deploy).

Project ref: `fyiegingyipqtxaiopng`  
Base URL: `https://fyiegingyipqtxaiopng.supabase.co`

---

## Step 0 — Edge functions exist and are named correctly

Supabase invokes functions by **slug in the URL**, not the display title in the dashboard.

| Required slug (exact) | Purpose |
|----------------------|---------|
| `sync-fixtures` | Import 104 WC fixtures + `external_id` (run once, then daily cron) |
| `sync-match-results` | Live + finished scores every 5 min (cron) + awards |
| `sync-match-odds` | Betting odds (hourly cron, up to 14 days before kickoff) |
| `sync-tournament-awards` | Golden Boot / Golden Glove + team mapping |

### 0a — Dashboard check

1. Supabase Dashboard → **Edge Functions**
2. Confirm **four** functions whose slugs match the table above
3. Common mistakes:
   - Display name “Sync Match Results” is fine — slug must still be `sync-match-results`
   - Underscores (`sync_match_results`) — **wrong** for this repo
   - Short names (`match-results`, `tournament-awards`) — **wrong**; curl will 404

### 0b — Quick HTTP check (no valid key needed)

Replace `<slug>` and run from any terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://fyiegingyipqtxaiopng.supabase.co/functions/v1/<slug>" \
  -H "Authorization: Bearer test"
```

| HTTP code | Meaning |
|-----------|---------|
| **401** | Function **exists** (auth rejected — expected with a fake token) |
| **404** | Function **missing** or **wrong slug** — deploy or rename |
| **500** | Function exists but env/secrets or runtime error — check logs |

**Verified externally (2026-06):** `sync-match-results` → **401**; `sync-tournament-awards` and `sync-match-odds` → **404** until deployed.

Re-check after you deploy in the dashboard.

### 0c — Deploy if missing

**CLI (one machine):**

```bash
supabase link --project-ref fyiegingyipqtxaiopng
supabase secrets set API_FOOTBALL_KEY=your_key
supabase functions deploy sync-fixtures
supabase functions deploy sync-match-results
supabase functions deploy sync-match-odds
supabase functions deploy sync-tournament-awards
```

**Browser:** follow [DASHBOARD-DEPLOY.md](../supabase/functions/DASHBOARD-DEPLOY.md).  
Functions 2 & 3 need **three files** each (`index.ts` + `_shared/awards-sync.ts` + `_shared/fifa-code-map.ts`).  
Import must be `./_shared/awards-sync.ts` — **not** `../_shared/` (module not found).

---

## Prerequisites

| Item | Verified |
|------|----------|
| Migrations through `20260606000006` | ☐ |
| `API_FOOTBALL_KEY` in Edge Functions → **Secrets** | ☐ |
| All three function slugs pass [0b](#0b--quick-http-check-no-valid-key-needed) (401, not 404) | ☐ |
| Optional secrets: `API_FOOTBALL_LEAGUE_ID=1`, `API_FOOTBALL_SEASON=2026` | ☐ |
| Matches that should auto-sync have `external_id` = API fixture id | ☐ |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically for deployed functions.

---

## Phase 1 — Static app & database (no API)

Auth is **username + password** (not magic link).

| Step | Pass |
|------|------|
| Sign in on `https://nfernie.github.io/World-Cup-2026---Cooper/` | ☐ |
| **Your pools** lists memberships | ☐ |
| Create pool → share link `/join/{code}` works | ☐ |
| Fixtures page shows matches, kickoff, odds columns | ☐ |
| Pool page: Overall → tournament → odds → Golden Boot/Glove → boards | ☐ |
| Sample finished draw NED 1–1 JPN awards draw odds | ☐ |

```sql
select pm.display_name, t.name, mmp.points, mmp.win_odds_decimal
from member_match_points mmp
join pool_members pm on pm.id = mmp.pool_member_id
join matches m on m.id = mmp.match_id
join teams th on th.id = m.home_team_id
join teams ta on ta.id = m.away_team_id
where th.fifa_code = 'NED' and ta.fifa_code = 'JPN';
```

---

## Phase 1b — Fixture import (`sync-fixtures`) — required once

Populates `matches` from API-Football (104 games) with `external_id` for odds/results sync.

Dashboard → **Test** on `sync-fixtures`, or service-role curl.

### Expected response

```json
{ "ok": true, "teamIds": 48, "imported": 104, "skipped": 0, "demoRemoved": 7 }
```

### SQL verify

```sql
select count(*) as fixtures,
       count(*) filter (where external_id is not null) as with_api_id
from matches;
```

Expect **~104** fixtures, all with `external_id`. Demo seed rows (no `external_id`) are removed on successful import.

**Cron:** `wc26-sync-fixtures` daily at 04:00 UTC (migration `20260607000007`).

---

## Phase 2 — Tournament awards (`sync-tournament-awards`)

Golden Boot / Golden Glove leaderboards read `teams.golden_boot_*` / `golden_glove_*`.  
Placeholders (`Squad forward`, `No. 1 goalkeeper`) stay until this sync overwrites them **and** API returns player stats.

### Invoke

Dashboard → `sync-tournament-awards` → **Invoke**, or:

```bash
curl -X POST "https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-tournament-awards" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

(Service role: Project Settings → API.)

### Expected response

```json
{
  "ok": true,
  "teamIds": 48,
  "scorers": 0,
  "goalkeepers": 40,
  "expectedTeams": 48
}
```

| Field | Healthy | Notes |
|-------|---------|-------|
| `teamIds` | ≈ `expectedTeams` (48) | API team ↔ DB `fifa_code` mapping |
| `scorers` | > 0 during tournament | Often **0** before WC goals exist |
| `goalkeepers` | > 0 if squads in API | May be low pre-tournament |

### SQL verify

```sql
select count(*) filter (where api_football_team_id is not null) as linked,
       count(*) as total
from teams;

select fifa_code, golden_boot_player_name, golden_glove_player_name, awards_synced_at
from teams
where fifa_code in ('ENG', 'BRA', 'NED');
```

| Pass | Criteria |
|------|----------|
| Plumbing | HTTP **200**, `linked` ≈ 48 |
| Meaningful Boot names | `golden_boot_player_name` not `Squad forward` **and** `scorers` > 0 in JSON |
| Pre-Cup demo | Use Admin → **Team awards** to type names manually |

`fifa-code-map.ts` only lists **alias** codes (≈8 rows), not all 48 — direct code + name matching handles the rest.

---

## Phase 3 — Results sync (`sync-match-results`)

**Schedule:** `wc26-sync-match-results` every **5 minutes** (`*/5 * * * *`) via pg_cron.

**API usage:** The cron fires every 5 minutes, but the function **calls API-Football only when a match is in the live poll window** (15 min before kickoff → 3 hours after). Pre-tournament invocations return `"apiCalls": 0` and `"skipped": "no matches in live poll window..."`. During a match it batches `fixtures?ids=` (up to 20 ids per call). Awards sync is **not** bundled here — see `sync-tournament-awards`.

### Invoke

```bash
curl -X POST "https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-match-results" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### Pass criteria

| Check | Pass |
|-------|------|
| HTTP 200, `"ok": true` | ☐ |
| Pre-tournament: `"apiCalls": 0`, `"activeCount": 0` | ☐ |
| During match: `"apiCalls" >= 1`, scores update in `matches` | ☐ |
| `matches.status = finished`, scores set, `scores_synced_at` set | ☐ |
| Leaderboard points update without admin | ☐ |

### Weak point: `external_id`

Seed matches from `20260603000003` are inserted **without** `external_id`.  
Results sync only updates rows where `matches.external_id` = API `fixture.id`.

```sql
select count(*) as matches,
       count(*) filter (where external_id is not null) as with_api_id
from matches;
```

If `with_api_id = 0`, expect `updated: 0` until you backfill ids from  
`GET /fixtures?league=1&season=2026`.

---

## Phase 4 — Odds sync (`sync-match-odds`)

**Schedule:** `wc26-sync-match-odds` every **15 minutes** (`*/15 * * * *`).

**API usage:** Fetches **Match Winner** odds **once per match**, only when kickoff is **~2 hours away** (window: now + 1h45m → now + 2h15m) and `odds_synced_at` is null. Pre-tournament / outside that window: `"apiCalls": 0`.

### Invoke

```bash
curl -X POST "https://fyiegingyipqtxaiopng.supabase.co/functions/v1/sync-match-odds" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### Test one match manually

```sql
-- Use a real fixture id from API-Football
update matches
set external_id = 'REPLACE_WITH_FIXTURE_ID',
    kickoff_at = now() + interval '2 hours',
    status = 'scheduled'
where id = (select id from matches limit 1);
```

Re-invoke → confirm `match_odds` row and `matches.odds_synced_at`.

---

## Phase 5 — Admin override (hybrid)

| Step | Pass |
|------|------|
| Super-admin overrides a finished match score | ☐ |
| `match_score_audit` row created | ☐ |
| `recalculate_pool_member_points` updates leaderboards | ☐ |
| Team awards override Boot/Glove names when API empty | ☐ |

---

## Phase 6 — Rate limits & cost

The React app reads **Supabase only** — it never calls API-Football. All external API traffic is server-side (pg_cron → Edge Functions).

| Job | Cron | API calls (typical) |
|-----|------|---------------------|
| `sync-match-results` | `*/5 * * * *` | **0** pre-tournament; **~1 per 5 min per live match** (batched by fixture id) |
| `sync-match-odds` | `*/15 * * * *` | **0** until ~2h before kickoff; **1 per match** (once, sets `odds_synced_at`) |
| `sync-tournament-awards` | `0 5 * * *` (daily) | **~50** (`/teams`, `/players/topscorers`, 48× `/players?team=`) |
| `sync-fixtures` | `0 4 * * *` (daily) | **1–2** (skips `/teams` remap when 48 teams already linked) |

**Rough daily budget:** ~52 calls/day before matches start; ~+40 calls per match-day with live games (1 odds + ~39 live polls over ~3h window).

| Check | Pass |
|-------|------|
| No browser calls to API-Football | ☐ |
| Pre-tournament `sync-match-results` → `apiCalls: 0` | ☐ |
| Odds only in ~2h pre-kickoff window, once per match | ☐ |
| Awards Glove path: ~48 `/players?team=` calls **once daily** | ☐ |

---

## Phase 7 — Production smoke

| Step | Pass |
|------|------|
| Username/password login on GitHub Pages | ☐ |
| Join via share link | ☐ |
| Team theme on pool pages only | ☐ |

---

## Goal scorecard (are live updates “working”?)

| Facet | Working when… |
|-------|----------------|
| **Awards / team link** | Slug `sync-tournament-awards` → 401/200, SQL `linked` ≈ 48 |
| **Boot/Glove names** | Above + API topscorers/GK data (or admin override) |
| **Live scores** | Slug `sync-match-results` → 200, `apiCalls > 0` during match window |
| **Live odds** | Slug `sync-match-odds` → 200, `apiCalls: 1` ~2h before kickoff |

**Not broken, just early:** 200 + `linked` ≈ 48 but `scorers: 0` and placeholder Boot names before the tournament.

**Broken / incomplete:** Any required slug returns **404**, or 500 `Missing env configuration` (set `API_FOOTBALL_KEY` secret and redeploy).

---

## Rollback

- Disable Edge Function schedules
- Admin UI for scores and team awards
- Forward-fix migrations in production (do not revert `20260603` on live DB)

---

## Logs

- Supabase → Edge Functions → select function → **Logs**
- GitHub Actions → **Deploy Database Migrations** (schema only; functions deploy separately)
