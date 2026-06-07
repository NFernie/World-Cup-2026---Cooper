# World Cup 2026 Tipping Pool — Progress Summary

**Project:** `NFernie/World-Cup-2026---Cooper`  
**Supabase project:** `fyiegingyipqtxaiopng`  
**Last updated:** 2026-06-09 (Prompt 007)

Handoff document for continuing work in another agent or session.

---

## 1. What the app is

Private FIFA World Cup 2026 tipping pool:

- Users join pools and are **assigned a nation** (48 teams, groups A–L).
- **Leaderboards:** odds-based points, tournament standing, Golden Boot, Golden Glove, knockout eliminations.
- **Fixtures page:** full schedule, filters, live scores, odds, goal scorers.
- **Stack:** Vite + React 19 + TypeScript + Tailwind 4 + shadcn-style UI + Supabase (Auth, Postgres, Edge Functions, pg_cron) + GitHub Pages.

---

## 2. Auth & deploy

| Topic | Status |
|-------|--------|
| Auth | Username/password (not magic link) — see `docs/AUTH-USERNAME-PASSWORD.md` |
| GitHub Pages | `.github/workflows/deploy.yml` pushes migrations + deploys edge functions on `main` |
| Edge secrets | `API_FOOTBALL_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `API_FOOTBALL_LEAGUE_ID=1`, `API_FOOTBALL_SEASON=2026` |
| Functions JWT | `verify_jwt = false` on sync functions (pg_cron invokes them) |

---

## 3. Database state (as of Prompt 007)

| Item | Value |
|------|-------|
| Matches in DB | **72** group-stage fixtures (real API schedule) |
| `external_id` populated | **72 / 72** |
| Teams | 48 seeded with `fifa_code`, `group_letter` |
| API team mapping | ~48 teams linked via `api_football_team_id` |

**SQL check:**

```sql
select count(*) as total,
       count(*) filter (where external_id is not null) as with_api_id
from matches;
-- Expected: total=72, with_api_id=72
```

---

## 4. API-Football integration

### Edge functions

| Function | Purpose | Cron | API gating |
|----------|---------|------|------------|
| `sync-fixtures` | Import fixture list + optional team ID map | Daily 04:00 UTC | Skips `/teams` if 48 teams already linked |
| `sync-match-results` | Live scores + goal events | Every 5 min | **0 API calls** unless match in live window (15 min pre-kickoff → 3h after; + brief post-FT for events) |
| `sync-match-odds` | Match Winner odds | Every 15 min | **1 call per match** ~2h before kickoff only (`odds_synced_at` null) |
| `sync-tournament-awards` | Golden Boot/Glove + team IDs | Daily 05:00 UTC | ~50 calls/day |

### Rate-limit fix (PR #6, merged)

**Problem:** Pre-tournament crons burned ~17k API calls/day (league-wide polling every 5 min + awards bundled into results + hourly odds for 14-day window).

**Fix:** Internal gating in edge functions + migration `20260608000008_api_rate_limit_cron.sql`.

**Expected daily usage:**

- Pre-tournament: ~52 calls (daily awards + fixtures)
- Per match day: +1 odds + ~39 live polls over ~3h window

### Goal scorers (Prompt 007)

- Migration `20260609000009_match_events.sql` — `match_events` table + `matches.events_synced_at`
- Events parsed from **same** `fixtures?ids=` response during live sync (no extra API call)
- UI shows scorers/assists on Fixtures page when `status` is `live` or `finished`

---

## 5. Prompt 007 — Fixtures, leaderboards & pool UX

### UI/UX approach

No “Claude Design Anthropic Labs” doc exists in the repo. Updates follow clean product UI patterns aligned with `PLAN.md`: mobile-first, readable hierarchy, subtle borders, accessible labels, FIFA-adjacent palette.

### Fixtures page

| Feature | Files |
|---------|-------|
| Nation flags beside team names | `TeamFlag.tsx`, `FixturesPage.tsx` |
| User team flag in WC26 header | `usePoolHeaderTeam.tsx`, `Layout.tsx`, `PoolShell.tsx` |
| Filters: date / round / group / team | `FixturesPage.tsx`, `poolBoards.ts` |
| “My team fixtures” toggle | `FixturesPage.tsx` |
| Goal scorers & assists | `FixturesPage.tsx` + `match_events` migration |
| Back link (not “Pool”) | `FixturesPage.tsx` |
| Live UI refresh | React Query 60s when any match `live` |

### Sweep leaderboards page (`/pools/:id/leaderboards`)

| Feature | Files |
|---------|-------|
| Dedicated page with dropdown filter | `LeaderboardsPage.tsx` |
| **Default: all leaderboards shown**; filter narrows to one | `LeaderboardsPage.tsx` (`board=all`) |
| Overall: Players assigned N, coach & captain | `teamStaff.ts`, `LeaderboardsPage.tsx` |
| Odds leaderboard title + 2h pre-kickoff scoring copy | `LeaderboardsPage.tsx` |
| Golden Boot / Glove / eliminations / knockout | `LeaderboardsPage.tsx` |

### Pool landing page

| Feature | Files |
|---------|-------|
| Prominent team flag on “Your team” card | `PoolPage.tsx` |
| **Sweep progress** `24/48` players + progress bar below Your team | `PoolPage.tsx` |
| Fixtures card, then Sweep leaderboards card (stacked) | `PoolPage.tsx` |
| Leaderboards link **only** on pool page (removed from home) | `HomePage.tsx`, `PoolPage.tsx` |

### Home page

| Feature | Files |
|---------|-------|
| “Your groups” (was “Your pools”) | `HomePage.tsx` |

### API rate limits (Prompt 007 review)

- `sync-match-results`: API only in live window (15 min pre-kickoff → 3h after)
- `sync-match-odds`: once per match ~2h before kickoff
- Goal events: same `fixtures?ids=` call (no extra API)

---

## 6. Migrations (apply order)

| Migration | Description |
|-----------|-------------|
| `20260603000000` | Initial schema |
| `20260603000001` | Seed 48 teams |
| `20260603000003` | Prompt 005 updates |
| `20260604000004` | Username/password auth |
| `20260605000005` | Prompt 006 awards columns |
| `20260606000006` | API football team id |
| `20260607000007` | Initial pg_cron schedules |
| `20260608000008` | **Rate-limit cron fix** |
| `20260609000009` | **Match events (goal scorers)** |

Run via GitHub Actions “Deploy Database Migrations” on push to `main`, or `supabase db push`.

---

## 7. Manual deploy fallback

If GitHub Actions fails, deploy edge functions from dashboard per `supabase/functions/DASHBOARD-DEPLOY.md`:

- `sync-fixtures`: 4 files (`index.ts` + 3 `_shared/*`)
- `sync-match-results`: 3 files (`index.ts` + `_shared/fixture-sync.ts` + awards/fifa if present)
- `sync-match-odds`: `index.ts` only
- `sync-tournament-awards`: 3 files

---

## 8. Testing checklist (after API limit resets)

1. **`sync-match-results`** (pre-tournament): `apiCalls: 0`, `skipped: "no matches in live poll window..."`
2. **`sync-match-odds`**: `apiCalls: 0` outside 2h window
3. **`sync-fixtures`**: `teamIdsSkipped: true`, `apiFixtureCount: 72`
4. **Fixtures page:** 72 matches, flags visible, filters work, “My team fixtures” toggles
5. **During a live match:** scores + goal scorers update within ~5 min (cron) + 1 min (UI poll from DB)

See `docs/TestLiveAPI.md` for curl commands and pass criteria.

---

## 9. Known limitations / follow-ups

| Item | Notes |
|------|-------|
| API daily limit | May still be exhausted from earlier burn — wait for reset at dashboard.api-football.com |
| Knockout fixtures | API may return 104 total eventually; only 72 group matches loaded so far |
| Golden Boot/Glove | Placeholder names until tournament starts and `sync-tournament-awards` runs |
| `fifa-code-map.ts` | ~8 alias rows only; name matching handles rest |
| Total matches | Plan says 104; DB has 72 (group stage only from API at time of sync) |

---

## 10. Key file map

```
web/src/pages/FixturesPage.tsx     — fixtures UI + filters + scorers
web/src/pages/LeaderboardsPage.tsx — sweep leaderboards + filter
web/src/pages/PoolPage.tsx         — your team, sweep progress, nav cards
web/src/lib/teamStaff.ts           — head coach + captain per nation
web/src/components/Layout.tsx      — WC26 header + team flag pill
web/src/hooks/usePoolHeaderTeam.tsx
web/src/lib/flags.ts               — flagcdn.com URLs
web/src/lib/poolBoards.ts          — stage labels, date helpers

supabase/functions/_shared/fixture-sync.ts  — live gating + events sync
supabase/functions/sync-match-odds/index.ts — 2h odds window
supabase/migrations/20260608000008_*.sql    — cron rate limits
supabase/migrations/20260609000009_*.sql    — match_events

docs/TestLiveAPI.md                — API test phases
ProgressSummary.md                 — this file
```

---

## 11. Git / deploy steps for the user

After pulling `main`:

1. **GitHub Actions** runs automatically on push — migrations + edge function deploy.
2. Confirm workflow **Deploy Database Migrations** succeeded (green check on GitHub).
3. Optionally test edge functions in Supabase Dashboard → Edge Functions → Test.
4. Open the GitHub Pages app → pool → **Fixtures** to verify UI.
5. No manual dashboard code paste needed if Actions deploy step passed.

If Actions failed on functions only: redeploy via Supabase CLI or dashboard using `DASHBOARD-DEPLOY.md`.
