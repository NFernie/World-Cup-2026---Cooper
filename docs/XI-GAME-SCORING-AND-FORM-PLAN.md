# World Cup XI mini-game — scoring, ratings, and form plan

Reference for how player numbers are set today, how matches are decided, and a proposed **post-match form** system for a future version.

**Related:** [SPIN-DRAFT-RATINGS-STRATEGY.md](./SPIN-DRAFT-RATINGS-STRATEGY.md) · [WORLD-CUP-XI-GAME-PLAN.md](./WORLD-CUP-XI-GAME-PLAN.md)

---

## 1. How an individual player rating is determined (e.g. Salah = 78)

When you draft **Mohamed Salah** and see **78**, that number is **not** calculated in the game. It was written to `squad_players.overall_rating` by the **`sync-squads`** edge function and read from the database at draft time.

### Data flow

```
API-Football roster + stats
        ↓
sync-squads (daily / manual)
        ↓
squad_players.overall_rating  (+ rating_source: "api" | "fallback")
        ↓
XI game draft UI shows that number
        ↓
Placement penalty applied only when you put him in a slot
```

### Two-tier rating logic (`sync-squads/_shared/squad-sync.ts`)

For every player on a nation’s roster:

#### Tier 1 — API season rating (preferred)

If API-Football has a **season match rating** for that player on that national team (`games.rating`, typically 0.0–10.0 from qualifiers, friendlies, or WC matches in season **2026**):

```
overall_rating = clamp(round(apiRating × 10), 50, 94)
rating_source  = "api"
```

Examples:

| API `games.rating` | Stored OVR |
|--------------------|------------|
| 7.8 | **78** |
| 8.2 | **82** |
| 6.5 | **65** |

The sync takes the **best** rating found across that player’s stat rows for the team/season.

#### Tier 2 — FIFA rank fallback (no API minutes yet)

If the player has **no** season rating yet (common pre-tournament or for unused squad members):

```
teamBase = clamp(round(86 - (fifaRank - 1) × 0.32), 58, 86)
nameOffset = deterministic hash of player name → integer in [-4, +4]
overall_rating = clamp(teamBase + nameOffset, 52, 90)
rating_source  = "fallback"
```

**Team base from nation FIFA rank** (`teams.global_fifa_rank`):

| FIFA rank | Team base OVR |
|-----------|---------------|
| 1 | 86 |
| 10 | 83 |
| 31 | 76 |
| 60 | 67 |
| 85 | 59 |

**Name offset** spreads players within the same squad so not everyone has the same number. The same name always gets the same offset (deterministic).

**Salah at 78 — likely explanations:**

1. **API path:** His national-team season rating was ~**7.8** → `round(7.8 × 10) = 78`.
2. **Fallback path:** Egypt’s FIFA rank gives a team base (e.g. ~76–80) plus a small name offset (e.g. +2) → **78**.

You can confirm which path was used in Supabase: `squad_players.rating_source` for that row (`api` vs `fallback`).

### What the game does *not* do to that 78

- Does not recalculate from club form, goals, or your draft round.
- Does not change during your tournament run (today).
- Does not use FUTBIN or live scraping during play.

Ratings refresh when **`sync-squads`** runs again (e.g. daily cron with `includeRatings: true`).

### After draft: placement penalty only

Once Salah is in a slot, the game uses **effective rating** for squad strength:

| Placement | Penalty | Salah 78 becomes |
|-----------|---------|------------------|
| Natural (e.g. RW in RW) | 0% | **78** |
| Wrong role, same family (RW at ST) | −5% | **74** |
| Wrong family (RW at CM) | −10% | **70** |

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

**Today:** Salah’s **78** comes from **`sync-squads`** (API season rating × 10, or FIFA-rank fallback + name spread), stored in **`squad_players`**, then reduced only if you play him out of position; that feeds a **fixed squad OVR** that drives all match outcomes.

**Future:** Keep that base, but let **each simulated match** produce player ratings that **nudge form** into the next game so the XI evolves through the tournament.
