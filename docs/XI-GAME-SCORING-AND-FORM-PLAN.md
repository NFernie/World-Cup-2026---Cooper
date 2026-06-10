# World Cup XI mini-game — scoring, ratings, and form plan

Reference for how player numbers are set today, how matches are decided, and a proposed **post-match form** system for a future version.

**Related:** [SPIN-DRAFT-RATINGS-STRATEGY.md](./SPIN-DRAFT-RATINGS-STRATEGY.md) · [WORLD-CUP-XI-GAME-PLAN.md](./WORLD-CUP-XI-GAME-PLAN.md)

---

## 1. How an individual player rating is determined (e.g. Robertson = 67)

When you draft **Andrew Robertson** and see **67**, that number is **not** calculated in the game. It was written to `squad_players.overall_rating` by the **`sync-squads`** edge function and read from the database at draft time.

### Data flow

```
API-Football GET /players?id={id}&season=2025
        ↓
Pick domestic league row with most minutes (e.g. PL 6.74)
        ↓
sync-squads (daily / manual with includeRatings)
        ↓
squad_players.overall_rating  (+ rating_source: domestic_2025 | club_2025 | national_2025 | unrated)
        ↓
XI game draft UI shows that number (fixed for the tournament until form is added)
        ↓
Placement penalty applied only when you put him in a slot
```

### Baseline rating logic (`sync-squads/_shared/domestic-baseline.ts`)

For every player on a nation’s roster, when `includeRatings: true`:

**API call:** `GET /players?id={playerId}&season=2025`

From `statistics[]`, pick the best row (minimum **45 minutes**):

| Priority | Source | Example |
|----------|--------|---------|
| 1 | **Domestic league** — highest minutes | Robertson: Premier League 1188 min, rating **6.74** → OVR **67**, `domestic_2025` |
| 2 | **Other club** (excludes cups, UCL, friendlies) | Lower-tier or non-listed leagues |
| 3 | **National team 2025** | International friendlies / qualifiers |
| — | **No qualifying row** | `unrated`, OVR **0** (no FIFA-rank fallback) |

```
overall_rating = clamp(round(apiRating × 10), 50, 94)
```

Examples:

| API `games.rating` | Stored OVR |
|--------------------|------------|
| 7.8 | **78** |
| 6.74 | **67** |
| 6.5 | **65** |

**Robertson at 67:** Liverpool Premier League 2025 row (`league.id` 39) has `games.rating` **6.74** and the most domestic minutes → `round(6.74 × 10) = 67`, `rating_source = domestic_2025`.

Confirm in Supabase: `select name, overall_rating, rating_source, baseline_club_api_team_id from squad_players where api_football_player_id = 289`.

### Position codes (LB, RW, …)

When `includePositions: true`, sync tries **club lineups** from the baseline season (`fixtures/lineups` for `baseline_club_api_team_id`), then **national friendlies** as fallback. Robertson should resolve to **LB** from Liverpool grid data when lineups are available.

### What the game does *not* do to that 67

- Does not recalculate from club form, goals, or your draft round.
- Does not change during your tournament run (today).
- Does not use FUTBIN or live scraping during play.

Baselines refresh when **`sync-squads`** runs with `{"includeRatings": true}` (daily cron). Post-WC **form fluctuations** are planned separately — not in baseline sync.

### After draft: placement penalty only

Once Robertson is in a slot, the game uses **effective rating** for squad strength:

| Placement | Penalty | Robertson 67 becomes |
|-----------|---------|------------------------|
| Natural (e.g. LB in LB) | 0% | **67** |
| Wrong role, same family (LB at CB) | −5% | **64** |
| Wrong family (LB at CM) | −10% | **60** |

Code: `effectiveRating()` in `web/src/lib/xiGame/types.ts`, penalties in `web/src/lib/xiGame/positions.ts`.

---

## 2. How match results are decided today

The mini-game uses **one squad strength number** for the whole run. Per-player performance does not feed the next match yet.

```
Base OVR (DB) → placement penalty → effective rating per slot
    → weighted squad OVR → win probability vs opponent → W/D/L
    → cosmetic goals + commentary
```

### Squad OVR

Weighted average of 11 effective ratings (`squadOverall()` in `simulate.ts`):

- **DEF / GK / FWD** — weight **1.1**
- **MID** — weight **1.0**

### Win probability

Logistic curve vs fixed opponent OVR:

```
P(win) = 1 / (1 + 10^((opponentOvr - squadOvr) / 12))
```

| Phase | Rules |
|-------|--------|
| Group (3 matches) | Win / draw / loss; ~22% draw chance |
| Knockout | Win or eliminated (no draws) |

Advance from groups: **≥ 4 points** (3 for a win, 1 for a draw).

Opponents are **hardcoded** fictional strengths (group ~70 OVR; knockouts 74 → 88 for final).

### Goals (cosmetic)

After the result is fixed, goals are generated. Your scorers are weighted by slot: **FWD 5, MID 3, DEF 1, GK 0.2**. Goals affect commentary and scoreline only — **not** squad OVR or the next match.

---

## 3. What’s missing today

| Gap | Effect |
|-----|--------|
| Squad OVR **static** after draft | A great match doesn’t help the next game |
| No **per-player match rating** | No “Salah 8.4, keeper 6.1” after full time |
| Opponents **hardcoded** | Not tied to real WC fixtures or pool teams |
| No **XI leaderboard** | Casual banter share only |
| DB ratings update on **sync**, not per simulated match | No in-run form curve |

---

## 4. Proposed improvement: post-match form

**Goal:** After each match, players get a **match rating** and a small **form** bump that affects **next match** effective OVR — visible and explainable.

### Match rating → form delta

Example events (tune in implementation):

| Event | Match rating effect |
|-------|---------------------|
| Goal | +1.0 to +1.5 |
| Assist | +0.5 |
| Clean sheet (GK/DEF, 0 conceded) | +0.3 to +0.5 |
| Yellow / red card | −0.2 / −0.5 |
| Team win | +0.2 morale (optional) |
| Heavy loss | −0.2 |

Map to OVR change for next match:

```
formDelta = round((matchRating - 6.5) × 2)   // 6.5 = average
nextEffective = clamp(baseEffective + formDelta, 45, 99)
```

Optional: **decay** form 50% each match; cap total form at ±5 to avoid snowballing.

### Architecture change

**Today:**

```
squadOverall(picks) → determineMatchOutcome → buildMatchPresentation
       (static)
```

**Proposed:**

```
mutable PlayerState[] (base effective + form)
  → squadOverall(state) per match
  → determineMatchOutcome
  → buildMatchPresentation + player match ratings
  → applyFormUpdates(state) before next match
```

**Likely touchpoints:**

| Area | Files |
|------|--------|
| Simulation | `web/src/lib/xiGame/simulate.ts` |
| Types | `web/src/lib/xiGame/types.ts` |
| Match UI | `web/src/components/xiGame/TournamentRun.tsx` |
| Pitch / ratings display | `web/src/components/xiGame/XiPitch.tsx` |
| History / banter | `xi_game_sessions.result_json`, banter metadata |

### UX ideas

1. **Post-match panel** — player | match rating | form change (+2 / −1)
2. **Pitch between matches** — show `78 (+2)` on slots; squad line `84 → 86`
3. **Commentary** — “Salah’s form is soaring after that brace.”
4. **Banter share** — MOTM, peak squad OVR, rating journey

### Design decisions (before build)

| Question | Options |
|----------|---------|
| Form scope | Per-player only vs squad morale bonus |
| Rating source | Simulated from match events vs blend real API ratings post-sync |
| Snowball control | Per-match cap, decay, max total form |
| Opponents | Keep fictional ladder vs `teams` table OVR |
| Leaderboard | Stay casual vs pool “best exit + peak OVR” |

### Suggested phases

| Phase | Scope |
|-------|--------|
| **A** | `PlayerTournamentState`, per-match `squadOverall`, form updates, persist in `result_json` |
| **B** | Post-match ratings UI, pitch form badges, commentary hooks |
| **C** | MOTM, squad rating sparkline, optional mini-leaderboard |
| **D** | Optional: use real API `games.rating` from sync when WC matches exist |

---

## 5. One-line summary

**Today:** A player’s OVR comes from **`sync-squads`** (2025 domestic `games.rating` × 10), stored in **`squad_players`**, then reduced only if you play him out of position; that feeds a **fixed squad OVR** that drives all match outcomes until a future form system is added.

**Future:** Keep that base, but let **each simulated match** produce player ratings that **nudge form** into the next game so the XI evolves through the tournament.
