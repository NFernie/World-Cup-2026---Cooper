# Spin Draft — Player ratings strategy (implemented)

**Decision:** Ratings come from **API-Football** (already integrated), stored in `squad_players`.
The FUTBIN scraping idea was **dropped** — no official API, gray-area terms, and the wrong
player pool (Ultimate Team cards, not FIFA squads). This matches how 38-0-0 works: a
**preloaded dataset**, never live scraping during play.

> How ratings are assigned **before any World Cup match is played** is covered in
> [§ Auto-assigning ratings with no matches](#auto-assigning-ratings-with-no-matches-played).

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

## Auto-assigning ratings with no matches played

This is the key pre-tournament problem: before 11 June 2026, players have **no World Cup
match data**, so there is no live rating to read. The implemented `sync-squads` function
uses a **two-tier strategy** so the game is playable from day one:

```
For each squad player:
  1. If API-Football has a season rating (games.rating, e.g. from
     qualifiers/friendlies in season 2026):
        overall = clamp(round(rating × 10), 50, 94)      source = "api"
  2. Otherwise (no minutes / no rating yet):
        base   = teamBaseRating(nation FIFA rank)        # 86 for #1 → 58 for low seeds
        offset = deterministic ±4 from the player's name # gives squad spread
        overall = clamp(base + offset, 52, 90)           source = "fallback"
```

Why this works with zero matches:

- **Team strength is known today** via `teams.global_fifa_rank` (seeded from the official
  FIFA ranking). France/Spain squads get high baselines; lower seeds get lower ones.
- The **±4 name-based offset** is deterministic, so the same player always gets the same
  rating, but players within a squad differ enough that draft choices matter.
- As soon as real matches are played, the **API rating overrides the fallback** on the next
  daily sync — no code change, no manual step.

`teamBaseRating(rank) = clamp(round(86 - (rank - 1) × 0.32), 58, 86)`

| FIFA rank | Baseline OVR | Example nation |
|-----------|--------------|----------------|
| 1 | 86 | France |
| 10 | 83 | Germany |
| 31 | 76 | Norway |
| 60 | 67 | South Africa |
| 85 | 59 | New Zealand |

Optional **manual overrides** (`rating_source = 'manual'`) for marquee players are never
overwritten by the sync — set them in the Supabase Table Editor if a star looks wrong.

---

## How it works: API-Football only

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

| Method | Effort | Quality | Verdict |
|--------|--------|---------|---------|
| **API-Football season rating** | Low — already integrated | Good; 0–10 ratings | **Primary (implemented)** |
| **FIFA-rank baseline** | Built in | Reasonable pre-tournament | **Fallback (implemented)** |
| **Manual overrides** | Low (a few stars) | Perfect for marquee names | **Optional** |
| **FUTBIN scraping** | High | Gray-area terms, wrong pool | **Dropped** |
| **Full manual spreadsheet (~1,200 rows)** | Very high | Perfect if you have time | **Overkill** |

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
4. Or: maintain a small overrides CSV in the repo (fifa_code, player_name, overall_rating) and run an import script in Cursor.

You do **not** need to rate every player manually if API sync is acceptable.

### Not recommended in the webapp

| Task | Why |
|------|-----|
| Live third-party rating fetch from browser | CORS, ToS, slow, brittle |
| Any scraping pipeline | Maintenance + legal risk; not needed |
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

- Scrape any third-party ratings site on a schedule
- Enter 1,200 ratings by hand (unless you want to)
- Configure anything in the live webapp for normal operation

---

## Final decision

| Item | Choice |
|------|--------|
| Squad list | API-Football `/players/squads` |
| Ratings | API-Football `statistics.games.rating` → OVR, FIFA-rank fallback |
| Overrides | Optional CSV or admin edits for stars |
| Scraping | **Not used** |
| Game data at runtime | Postgres only |

---

## Next build step (when you say go)

1. Migration + `sync-squads` edge function (API-Football path).
2. Provisional banner + game scaffold + link under leaderboards.
3. Classic draft UI + tournament simulation.
4. Banter post on result.

No scraping pipeline is used.

---

*See also: [WORLD-CUP-XI-GAME-PLAN.md](./WORLD-CUP-XI-GAME-PLAN.md)*
