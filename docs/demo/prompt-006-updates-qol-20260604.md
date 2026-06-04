# Prompt 006 — Updates & QoL

**Date:** 2026-06-04  
**Branch:** `main`

## Updates

### 1. Bolder team theming + World Cup margin art

- Pool background gradient uses stronger team colour mix (~42% / 28% primary/secondary).
- Leaderboard rows use team-tinted cards and a left accent for “your” rows.
- `PoolWorldCupDecor`: fixed left/right margin SVG art (ball + trophy motifs) at **30% opacity** (~70% transparent).

### 2. Golden Boot & Golden Glove leaderboards

- DB: `teams.golden_boot_player_name`, `golden_boot_goals`, `golden_glove_player_name`, `golden_glove_clean_sheets`.
- Views: `leaderboard_golden_boot`, `leaderboard_golden_glove` (per pool, ranked).
- Pool page shows **player name + nation**, goals / clean sheets; **(you)** if your assigned nation matches.
- Leading player callout; pool win condition = tournament leader’s nation matches your assignment.
- Super-admin: **Teams — awards & tournament** on Admin page.

### 3. Group stage elimination board

- View: `board_group_eliminations` (`tournament_stage = eliminated`).
- Ordered by `global_fifa_rank` (FIFA world ranking).
- Shows group letter where set.

### 4. Knockout qualifiers board

- View: `board_knockout_qualifiers` (R32 and beyond).
- Sorted by FIFA rank (highest rank number = weakest first).
- Highlights **lowest-ranked team** that advanced to knockouts.

### Migration

`supabase/migrations/20260605000005_prompt006.sql`

## QoL — Usernames

- **3–24 characters:** letters (any case), digits, `_`, `.`, `-`
- Stored with chosen casing; uniqueness is **case-insensitive** (`lower(username)`).
- Auth email remains `lowercase@wc26.auth.local` internally.
- SQL `is_username_available` and signup trigger updated.

## Deploy

1. **Deploy Database Migrations** (new migration + config).
2. **Deploy Web (GitHub Pages)**.
3. Super-admin: set player names, goals, stages, and FIFA ranks under Admin.

## Files touched (summary)

| Area | Files |
|------|--------|
| DB | `20260605000005_prompt006.sql` |
| Pool UI | `PoolPage.tsx`, `PoolShell.tsx`, `PoolWorldCupDecor.tsx`, `useTeamTheme.tsx`, `index.css` |
| Admin | `TeamAwardsAdmin.tsx`, `AdminPage.tsx` |
| Auth | `authUsername.ts`, `LoginPage.tsx`, migration username rules |
| Types | `database.ts`, `poolBoards.ts` |

---

## Prompt 006 follow-up (fixes)

### Margin stock imagery
- Replaced inline SVG with Unsplash stock photos in `web/public/decor/` (`wc-stadium-left.jpg`, `wc-trophy-right.jpg`).
- `PoolWorldCupDecor` uses `<img>` at 30% opacity (~70% transparent) with edge fade masks.

### Leaderboard order
1. **Overall leaderboard** (tournament standing)
2. **Odds points leaderboard**
3. Golden Boot / Glove, elimination boards (unchanged)

### API-Football auto awards
- `supabase/functions/_shared/awards-sync.ts` + `sync-tournament-awards`
- Maps API team IDs via `/teams?league&season`
- **Golden Boot:** `/players/topscorers` → best goals per nation → `teams.golden_boot_*`
- **Golden Glove:** `/players?team={id}` → goalkeeper with most clean sheets (falls back to saves if API omits clean_sheet)
- `sync-match-results` also runs awards sync after score updates
- Migration `20260606000006_prompt006_awards_api.sql` adds `api_football_team_id`

Deploy edge functions: `supabase functions deploy sync-tournament-awards` and redeploy `sync-match-results`.
