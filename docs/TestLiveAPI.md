# Test plan — live API-Football & Supabase sync

Use this checklist after **all migrations through `20260606000006`** are applied, edge functions are deployed, and secrets are set on the linked Supabase project (`fyiegingyipqtxaiopng`).

**Quick automated smoke test** (from repo root):

```bash
export API_FOOTBALL_KEY=...
export SUPABASE_URL=https://fyiegingyipqtxaiopng.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...
chmod +x scripts/test-live-api.sh
./scripts/test-live-api.sh
```

See also **[API-INTEGRATION-GUIDE.md](./API-INTEGRATION-GUIDE.md)** for how odds, results, and Golden Boot/Glove fit together.

---

## Prerequisites

| Item | Verified |
|------|----------|
| Migrations applied through `20260606000006_prompt006_awards_api.sql` | ☐ |
| `API_FOOTBALL_KEY` in Supabase Edge Function secrets | ☐ |
| `SUPABASE_SERVICE_ROLE_KEY` available to functions (auto-injected) | ☐ |
| Optional: `API_FOOTBALL_LEAGUE_ID=1`, `API_FOOTBALL_SEASON=2026` | ☐ |
| Edge functions **manually deployed** (not in GitHub Actions): `sync-match-results`, `sync-match-odds`, `sync-tournament-awards` | ☐ |
| Cron or manual schedule for sync functions during the tournament | ☐ |
| Matches that should sync from API have `external_id` = API-Football `fixture.id` | ☐ |

Deploy edge functions:

```bash
supabase link --project-ref fyiegingyipqtxaiopng
supabase secrets set API_FOOTBALL_KEY=your_key
supabase functions deploy sync-match-results
supabase functions deploy sync-match-odds
supabase functions deploy sync-tournament-awards
```

---

## Phase 1 — Static app & database (no API)

Auth is **username + password** (synthetic email `username@wc26.auth.local`), not magic link. Confirmations are off (`enable_confirmations = false`, `mailer_autoconfirm` via deploy workflow).

| Step | Pass |
|------|------|
| Sign in on GitHub Pages URL with username/password | ☐ |
| Home → **Your pools** lists memberships | ☐ |
| Create pool → host auto-joins → share link `/join/{code}` works | ☐ |
| Second user in second pool gets **different** `assigned_team_id` | ☐ |
| **Fixtures** page shows matches, local kickoff, odds columns | ☐ |
| Pool page: Overall + tournament leaderboards, Golden Boot/Glove boards, elimination boards | ☐ |
| Finished sample draw (NED 1–1 JPN) awards draw odds after `recalculate_pool_member_points` | ☐ |

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

## Phase 2 — API-Football connectivity (curl)

Use league **1**, season **2026** (World Cup). [API-Football WC 2026 guide](https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports).

| Endpoint | Purpose | Expect |
|----------|---------|--------|
| `GET /leagues?id=1&season=2026` | Coverage | `coverage` includes fixtures, standings, players |
| `GET /teams?league=1&season=2026` | Team ID map | `results: 48`, each team has `id` + `code` or name |
| `GET /fixtures?league=1&season=2026` | Fixture IDs | Use `fixture.id` for `matches.external_id` |
| `GET /players/topscorers?league=1&season=2026` | Golden Boot | Non-empty once goals are recorded |
| `GET /players?team={id}&season=2026` | Golden Glove | Goalkeepers with stats per squad |

```bash
curl -H "x-apisports-key: $API_FOOTBALL_KEY" \
  "https://v3.football.api-sports.io/teams?league=1&season=2026"
```

**Team mapping check** — after `sync-tournament-awards`, most rows should have `api_football_team_id`:

```sql
select count(*) filter (where api_football_team_id is not null) as mapped,
       count(*) as total
from teams;
```

Unmapped teams block per-squad Golden Glove sync and topscorer joins for that nation.

---

## Phase 3 — Odds sync (`sync-match-odds`)

**Schedule:** hourly cron, or manual invoke.

1. Ensure a `scheduled` match has `kickoff_at` in ~2 hours **and** `external_id` set to a real fixture id.
2. Invoke function; confirm `match_odds` row and `matches.odds_synced_at`.
3. Fixtures UI shows home / draw / away decimals.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/sync-match-odds" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Note:** Seed matches from `20260603000003` have **no** `external_id` — odds/results API sync will skip them until fixtures are imported or admin sets ids.

---

## Phase 4 — Results sync (`sync-match-results`)

**Schedule:** every 5 minutes on match days.

1. API reports fixture `FT`.
2. Invoke `sync-match-results`.
3. Confirm `matches.status = finished`, scores set, `scores_synced_at` populated.
4. Leaderboard odds totals update; function also runs **tournament awards** sync at the end.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/sync-match-results" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Response includes `awards: { teamIds, scorers, goalkeepers, expectedTeams }`. Healthy mapping: `teamIds` close to `expectedTeams` (48).

---

## Phase 5 — Tournament awards (`sync-tournament-awards`)

Golden Boot / Golden Glove on pool pages read from `leaderboard_golden_boot` / `leaderboard_golden_glove` views → `teams.golden_boot_*` / `golden_glove_*`.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/sync-tournament-awards" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

| Check | Pass |
|-------|------|
| `teams.api_football_team_id` populated (≈48) | ☐ |
| `golden_boot_player_name` not still `Squad forward` for teams with goals in API | ☐ |
| `golden_glove_player_name` not still `No. 1 goalkeeper` where GK data exists | ☐ |
| `awards_synced_at` recent on updated rows | ☐ |
| Pool UI Golden Boot/Glove leaderboards show real names | ☐ |

**Hybrid fallback:** Super-admin → **Team awards** on Admin page to override names/stats manually.

---

## Phase 6 — Admin override (hybrid path)

1. Super-admin → override a finished match score.
2. Confirm `match_score_audit` row.
3. `select recalculate_pool_member_points('<match_id>');`
4. Leaderboards reflect new points.

---

## Phase 7 — Rate limits & cost

| Check | Pass |
|-------|------|
| No client-side calls to API-Football | ☐ |
| Results only fetched for `FT` fixtures | ☐ |
| Odds only fetched in pre-kickoff window | ☐ |
| Golden Glove: ~48 × `/players?team=` per awards run (120ms delay between teams) | ☐ |
| Daily request count within plan tier | ☐ |

---

## Phase 8 — Production smoke

| Step | Pass |
|------|------|
| Username/password login on GitHub Pages | ☐ |
| Join via share link | ☐ |
| Team theme on pool pages only; home neutral | ☐ |
| Leaderboard order: Overall → tournament → odds → Golden Boot/Glove → boards | ☐ |

---

## Rollback

- Disable cron triggers; use admin UI for scores and team awards.
- Do not revert production migrations; fix forward with mapping or manual awards.

---

## Logs

- Supabase → Edge Functions → Logs (`sync-match-results`, `sync-tournament-awards`, `sync-match-odds`).
- GitHub Actions → **Deploy Database Migrations** (schema only; functions are separate).
