# Prompt 007 — API review & Golden Boot/Glove integration summary

**Date:** 2026-06-02  
**Scope:** Review `TestLiveAPI`, document full API path, clarify placeholder player names on award leaderboards.

## Deliverables

| Item | Path |
|------|------|
| Expanded live API test plan | `docs/TestLiveAPI.md` |
| Integration summary (all facets + awards) | `docs/API-INTEGRATION-GUIDE.md` |
| Runnable smoke script | `scripts/test-live-api.sh` |
| Improved team ID mapping | `supabase/functions/_shared/fifa-code-map.ts`, updated `awards-sync.ts` |

## TestLiveAPI review

- Updated through migrations `20260606000006`, username/password auth, Prompt 006 boards/awards.
- Added phases for API curl checks, awards sync, fixture `external_id` backfill, and `scripts/test-live-api.sh`.
- Noted edge functions are **not** deployed by GitHub Actions — manual `supabase functions deploy` required.

## Live API testing in cloud agent

`API_FOOTBALL_KEY` / `SUPABASE_SERVICE_ROLE_KEY` were not available in the agent environment, so end-to-end curl/edge invokes were not executed here. Run `./scripts/test-live-api.sh` locally or in CI with secrets.

## Golden Boot / Golden Glove — player names

**Current behaviour:** Leaderboards show `Squad forward` and `No. 1 goalkeeper` because migration `20260605000005` sets those placeholders when columns are null, and API sync has not yet overwritten them (or cannot: unmapped teams, empty topscorers, undeployed functions).

**To get real names:** Deploy secrets + functions → map 48 `api_football_team_id` values → run `sync-tournament-awards` after API has goal/GK stats → verify in SQL/UI. Admin team awards remain the manual override path.

See **API-INTEGRATION-GUIDE.md** for the full checklist and troubleshooting table.
