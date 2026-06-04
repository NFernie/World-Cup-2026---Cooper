# Test plan — live API-Football updates

Use this checklist after the site is deployed and Supabase migrations through `20260603000003` are applied.

## Prerequisites

| Item | Verified |
|------|----------|
| `API_FOOTBALL_KEY` set in Supabase Edge secrets | ☐ |
| `SUPABASE_SERVICE_ROLE_KEY` set | ☐ |
| Edge functions deployed: `sync-match-results`, `sync-match-odds` | ☐ |
| `API_FOOTBALL_LEAGUE_ID` / `API_FOOTBALL_SEASON` env vars correct for WC 2026 | ☐ |
| Matches in DB have `external_id` matching API-Football fixture IDs | ☐ |

## Phase 1 — Static data (no API)

1. Open home → sign in → confirm **Your pools** lists all memberships.
2. Create pool → host auto-joins → **Share link** opens `/join/{code}` (no 404).
3. Second user joins second pool → **different** `assigned_team_id` per pool in `pool_members`.
4. **Fixtures** page shows sample matches, local kickoff times, odds columns.
5. Finished draw (NED 1–1 JPN) awards **draw odds** to both assigned members after `recalculate_pool_member_points`.

```sql
-- Verify draw points
select pm.display_name, t.name, mmp.points, mmp.win_odds_decimal
from member_match_points mmp
join pool_members pm on pm.id = mmp.pool_member_id
join matches m on m.id = mmp.match_id
join teams th on th.id = m.home_team_id
join teams ta on ta.id = m.away_team_id
where th.fifa_code = 'NED' and ta.fifa_code = 'JPN';
```

## Phase 2 — Odds sync (`sync-match-odds`)

**Schedule:** hourly cron, or manual invoke.

1. Insert or update a `scheduled` match with `kickoff_at` in ~2 hours.
2. Set `external_id` to a real API-Football fixture id.
3. Invoke function; confirm `match_odds` row created.
4. UI fixtures show home / draw / away decimals.

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/sync-match-odds" \
  -H "Authorization: Bearer $ANON_OR_SERVICE_KEY"
```

## Phase 3 — Results sync (`sync-match-results`)

**Schedule:** every 5 minutes on match days.

1. Wait until API reports fixture `FT`.
2. Invoke `sync-match-results`.
3. Confirm `matches.status = finished`, scores set, `scores_synced_at` populated.
4. Leaderboard odds totals update without manual admin action.

## Phase 4 — Admin override (hybrid path)

1. Super-admin → override a score on finished match.
2. Confirm `match_score_audit` row.
3. Re-run `select recalculate_pool_member_points('<match_id>');`
4. Leaderboard reflects new points.

## Phase 5 — Rate limits & cost

| Check | Pass |
|-------|------|
| No client-side calls to API-Football | ☐ |
| Results only fetched for `FT` fixtures | ☐ |
| Odds only fetched in pre-kickoff window | ☐ |
| Daily request count within plan tier | ☐ |

## Phase 6 — Production smoke

| Step | Pass |
|------|------|
| Magic link on GitHub Pages URL | ☐ |
| Join via share link | ☐ |
| Team theme colours on pool pages only | ☐ |
| Home page neutral (no team theme) | ☐ |

## Rollback

- Disable cron triggers.
- Use admin UI for manual scores until API mapping is fixed.
- Revert migration `20260603000003` only in dev — production should use forward fixes.

## Logs

- Supabase → Edge Functions → Logs for each sync invocation.
- GitHub Actions → Deploy Database Migrations (schema changes).


## Tournament awards (Golden Boot / Glove)

```bash
curl -X POST "$SUPABASE_URL/functions/v1/sync-tournament-awards"   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Also runs at the end of `sync-match-results`. Requires `API_FOOTBALL_LEAGUE_ID` and `API_FOOTBALL_SEASON` (defaults: World Cup `1`, `2026`).
