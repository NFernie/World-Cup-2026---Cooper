# Spin Draft — Player ratings strategy

**Question:** Is FUTBIN the right way to get ratings? What does 38-0-0 do? What do *you* need to do manually?

**Recommendation:** **Do not use FUTBIN as the primary pipeline.** Use **API-Football** (already integrated) for squads + ratings, with optional **manual CSV overrides** for a handful of mismatches. This matches how 38-0-0 actually works (preloaded dataset, not live scraping during play).

---

## How 38-0-0 gets ratings

From [38-0-0.com](https://38-0-0.com):

> *“Squads and player ratings based on a **public football dataset**.”*

Their guides page lists *“How 38-0-0 player ratings work”* — ratings are **preloaded** before you play. The game does **not** call an external site on each spin.

In practice that means:

| What they do | What they do **not** do |
|--------------|-------------------------|
| Ship a **static dataset** (JSON/CSV in the app or CDN) | Scrape FUTBIN or similar on every draft |
| Show FIFA-style **OVR + six attributes** (PAC, SHO, PAS, DRI, DEF, PHY) | Use an official public ratings API |
| Compute season outcome from **OVR × position fit** | Pull live Opta during gameplay |

The exact upstream dataset is not published in their FAQ. It is likely a **curated export** (EA/FIFA-style card data or a community PL dataset), imported once and versioned — same *pattern* we should use: **sync → store in Postgres → game reads DB only**.

---

## Why FUTBIN is a poor primary source

| Issue | Impact |
|-------|--------|
| **No official API** | Scraping only; breaks when HTML changes |
| **Terms of use** | Automated scraping may violate FUTBIN/EA terms |
| **Wrong player pool** | FUTBIN = Ultimate Team **cards**, not FIFA squad lists |
| **Name matching** | ~1,200 squad players × fuzzy match = many failures |
| **Maintenance** | You own pagination, rate limits, nation IDs, special cards |
| **Not in your stack** | Extra secret, extra cron, extra failure mode |

FUTBIN is fine for a **one-off research export** you review in a spreadsheet. It is a bad **production dependency**.

---

## Recommended approach: API-Football only (+ optional overrides)

You already pay for and sync **API-Football** for WC 2026 (`league=1`, `season=2026`).

### Data flow

```
API-Football (edge function, scheduled)
    → squad_players table in Supabase
    → Spin Draft UI reads DB only
```

### Endpoints (same provider as fixtures/odds)

| Step | Endpoint | Gives you |
|------|----------|-----------|
| 1. Roster | `GET /players/squads?team={apiTeamId}` | Name, position, id, photo, shirt # |
| 2. Ratings | `GET /players?team={apiTeamId}&season=2026` | Per-player `statistics[].games.rating` (0–10), minutes, goals |

Your codebase already calls `/players?team=` in `syncGoalkeepersByTeam` — extend that to persist **all** squad players, not just the best GK.

### Converting API rating → game OVR (1–99)

API-Football uses a **0–10 match/season rating** (similar to WhoScored/FotMob), not FIFA OVR.

Simple Classic-mode mapping:

```
overall_rating = clamp(round(api_rating * 10), 50, 94)
```

Examples:

| API `rating` | Game OVR |
|--------------|----------|
| 7.2 | 72 |
| 8.5 | 85 |
| 6.0 | 60 |

If `rating` is null (bench player, no minutes):

```
overall_rating = 62   # default sub
# or derive from position tier + national team FIFA rank
```

Optional six attributes for Classic UI (if you want 38-0-0-style PAC/SHO bars):

- **MVP:** show **OVR only** (Classic only mode — you chose simple).
- **Later:** map API sub-stats (pace from dribbles, defending from tackles) — not required for v1.

### Provisional vs final 26-man squads

| Phase | Source | Your action |
|-------|--------|-------------|
| **Now** | API `/players/squads` (provisional) | None — automated sync after deploy |
| **After FIFA announcement** | Re-run sync | None — automated; banner removed in app |

Game page banner: *Provisional squads — will update when FIFA confirms final 26-man lists.*

---

## Alternatives compared

| Method | Effort | Quality | Legal/automation | Verdict |
|--------|--------|---------|------------------|---------|
| **API-Football** (recommended) | Low — extend existing sync | Good; 0–10 ratings | Already licensed | **Primary** |
| **FUTBIN scrape** | High | Best FIFA “feel” | Gray area | **Avoid in prod** |
| **One-time FUTBIN CSV import** | Medium manual | Best FIFA “feel” | One-off export OK | **Optional override file** |
| **Fully manual spreadsheet** | Very high (~1,200 rows) | Perfect if you have time | Fine | **Overkill** |
| **Formula from goals/assists only** | Medium dev | Weaker | Fine | Fallback inside API path |

---

## What runs where

### In Cursor / repo (agent or you — no manual data entry)

| Task | Where |
|------|--------|
| DB migration (`squad_players`, game sessions) | Cursor → commit → `main` |
| `sync-squads` edge function | Cursor → deploy via GitHub Actions |
| OVR formula + simulation logic | Cursor |
| Game UI (draft, result, banter post) | Cursor |
| Leaderboards link + provisional banner | Cursor |
| Optional: `scripts/import-rating-overrides.ts` | Cursor |

### Supabase Dashboard (you — one-time / occasional)

| Task | When |
|------|------|
| Confirm `API_FOOTBALL_KEY` secret exists | Already done for fixtures |
| Run **Deploy Database Migrations** workflow | After migration merged |
| Check edge function logs after first `sync-squads` run | Once after deploy |
| Optional: invoke `sync-squads` manually from Dashboard | If you want data before cron |

### Manual but efficient (you — optional, ~30–60 min total)

Only if API ratings look wrong for star players:

1. Open **Supabase Table Editor** → `squad_players` (or a small admin page we add).
2. Filter one nation (e.g. France).
3. Fix **10–20 star ratings** by hand (Mbappé, Messi, etc.) — set `rating_source = 'manual'`.
4. Or: maintain `data/spin-draft-rating-overrides.csv` in the repo (fifa_code, player_name, overall_rating) and run import script in Cursor — **no FUTBIN required**.

You do **not** need to rate every player manually if API sync is acceptable.

### Not recommended in the webapp

| Task | Why |
|------|-----|
| Live FUTBIN fetch from browser | CORS, ToS, slow, brittle |
| Admin UI to scrape FUTBIN | Same problems |
| Per-pool rating entry | Side game; global player data is enough |

A **read-only admin view** (sync status, unmatched players, edit OVR) in `/admin` is useful; bulk import stays in Cursor/CI.

---

## Manual checklist for you

### Before first playable build

- [ ] Confirm API-Football plan has enough daily quota for ~48–100 calls per squad sync (you already budget for awards sync).
- [ ] Merge + deploy DB migration + `sync-squads` function (GitHub Actions — **no action** except watch CI).
- [ ] After deploy: verify `squad_players` has rows (Supabase Table Editor or SQL).

### Optional quality pass (recommended once)

- [ ] Spot-check **3 nations** (e.g. France, USA, Japan): do top 5 players look sensible?
- [ ] If not: add overrides CSV for those players only, re-run import script in Cursor.

### When FIFA publishes final 26-man squads

- [ ] Re-run sync (automatic cron or manual invoke) — **no spreadsheet work**.
- [ ] Confirm app banner switches from provisional to final (we flip `squads_provisional` flag).

### You never need to

- Scrape FUTBIN on a schedule
- Enter 1,200 ratings by hand (unless you want to)
- Configure anything in the live webapp for normal operation

---

## Updated decision (replaces FUTBIN-primary plan)

| Item | Choice |
|------|--------|
| Squad list | API-Football `/players/squads` |
| Ratings | API-Football `statistics.games.rating` → OVR formula |
| Overrides | Optional CSV or admin edits for stars |
| FUTBIN | **Not used** in production pipeline |
| Game data at runtime | Postgres only |

---

## Next build step (when you say go)

1. Migration + `sync-squads` edge function (API-Football path).
2. Provisional banner + game scaffold + link under leaderboards.
3. Classic draft UI + tournament simulation.
4. Banter post on result.

No FUTBIN script unless you later want a **one-time** CSV export for override comparison.

---

*See also: [WORLD-CUP-XI-GAME-PLAN.md](./WORLD-CUP-XI-GAME-PLAN.md)*
