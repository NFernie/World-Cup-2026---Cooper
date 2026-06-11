# World Cup XI — ratings plan (FIFA-anchored hybrid)

Reference for aligning nation OVR with FIFA rank while preserving star presence from squad data.

**Related:** [SPIN-DRAFT-RATINGS-STRATEGY.md](./SPIN-DRAFT-RATINGS-STRATEGY.md) · [XI-GAME-SCORING-AND-FORM-PLAN.md](./XI-GAME-SCORING-AND-FORM-PLAN.md)

---

## Problem

Player OVR today comes from **2025 club/domestic** API-Football ratings (`round(apiRating × 10)`). When averaged into a team Top-11, nations cluster in a narrow band (observed ~65–75) and **do not track `teams.global_fifa_rank`** (e.g. Netherlands below Iran).

FIFA rank is stored on `teams` but was not used in XI opponent strength.

---

## Recommended approach: anchored hybrid

Use **real squad data** for relative strength and **FIFA rank** as an anchor for absolute scale.

### Decisions (locked for Phase 1)

| Choice | Decision |
|--------|----------|
| FIFA vs player blend | **Loose blend** — 55% FIFA anchor, 45% Top-11 squad average |
| Your drafted XI | **Unchanged** — placement-modified `effectiveRating` → `squadOverall()` |
| Opponent nations | **Anchored Top-11** — blend used in tournament schedule |
| Marquee overrides | **Trust the blend** — no manual CSV for now |

### Player-level read-time adjust (Phase 1b — implemented, no API)

Applied in `fetchAllSquadPlayers()` via `applySquadRatingAdjustments()`:

1. **League multiplier** on raw `overall_rating` (`leagueTiers.ts`) — uses `baseline_league_id` when set, else `rating_source` proxy
2. **Nation clamp** — `[fifaTeamOvr - 8, fifaTeamOvr + 12]`
3. **Star floor** — top 3 per nation by **raw** rating among players with `raw >= fifaTeamOvr - 8` get at least `fifaTeamOvr + 6`
4. **`manual`** ratings are never adjusted

### Player-level sync (Phase 2 — implemented)

`pickBaselineFromStatistics()` in `domestic-baseline.ts` now prioritises:

1. **National team 2025** (`national_2025`)
2. **UCL / Europa / Conference** (`continental_2025`)
3. **Top domestic 2025** (`domestic_2025`)
4. **Other club** (`club_2025`)
5. **FIFA-rank fallback** (`fallback_2025`) — `teamBaseRating ± name offset`

Phased rebaseline (budget-friendly):

```bash
# Top 10 done — next band without re-hitting ranks 1–10:
curl "https://<project>.supabase.co/functions/v1/sync-squads?force=true&includeRatings=true&fifaRankMin=11&fifaRankMax=20"
```

Full rebaseline: `rebaseline=true` (all ~1,248 players). Re-run until `ratingsBudgetReached` is false.

Daily match form (separate function): see [XI-GAME-FORM-SYNC-PLAN.md](./XI-GAME-FORM-SYNC-PLAN.md).

### Team-level (Phase 1 — implemented, no API)

```
fifaOvr  = clamp(round(86 - (rank - 1) × 0.32), 58, 86)
top11Ovr = star-weighted mean(top 11 squad_players.overall_rating)  # decay weights
teamOvr  = round(0.55 × fifaOvr + 0.45 × top11Ovr)
```

If Top-11 is missing, use `fifaOvr` alone.

**Code:** `fifaTeamOvr()`, `teamAnchoredOvr()` in `web/src/lib/xiGame/teamRating.ts`  
**Used by:** `buildOpponentPool()` in `web/src/lib/xiGame/tournamentSchedule.ts`

### Team-level (Phase 3 — future)

Star-weighted Top-11 (decay weights on ranked players) instead of flat mean.

### Team-level (Phase 4 — optional)

Light isotonic adjustment so 48 nation OVRs stay broadly monotonic with FIFA rank (allow ±2 inversions).

---

## Data sources (priority)

| Priority | Source | Notes |
|----------|--------|-------|
| 1 | API-Football national 2025/26 | Best for international level |
| 2 | API-Football UCL/UEL 2025 | Best for star players |
| 3 | API-Football top domestic 2025 | Current baseline |
| 4 | `teams.global_fifa_rank` | Anchor + unrated fallback |
| — | FUTBIN / scraping | Not planned |

---

## Implementation phases

| Phase | Scope | API needed? | Status |
|-------|--------|-------------|--------|
| **1** | FIFA-anchored team OVR for tournament opponents | No | **Done** |
| **1b** | Read-time league mult + nation clamp + star floor | No | **Done** |
| **2** | Best-of-tier player sync + phased rebaseline | Yes (`sync-squads`) | **Done** (top 10) |
| **2b** | Phased rebaseline ranks 11–48 (`fifaRankMin`/`Max`) | Yes | Ready |
| **3** | Star-weighted Top-11 for nation OVR | No | **Done** |
| **4** | Rank-order guardrail | No | Optional |
| **5** | Daily WC match form (`sync-squad-form`) | Yes (`sync-squad-form`) | **Done** |
| **6** | In-run simulated form (mini-game sessions) | No | Future |

---

## Target outcome

Nation OVR spread roughly **68–88**, with France/Argentina/Netherlands top-tier and lower FIFA ranks appropriately weaker, while squad quality still nudges nations up or down within that band.

---

## Tabulating ratings

```bash
node scripts/tabulate-team-ratings.mjs
```

Prints Top-11 only, FIFA anchor, and blended OVR for all 48 teams (reads existing `teams` + `squad_players` in Supabase — no API-Football calls).
