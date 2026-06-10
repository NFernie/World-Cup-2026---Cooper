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

### Player-level (Phase 2 — requires API re-sync)

When API budget allows, improve `sync-squads` inputs:

1. **National team 2025/26** rows (qualifiers/friendlies)
2. **UCL / Europa 2025** rows (star presence)
3. **Top-tier domestic 2025** (current logic)
4. **FIFA-rank fallback** for unrated players (`teamBase ± deterministic spread`)

Optional: clamp each player OVR to `[fifaTeamBase - 8, fifaTeamBase + 6]`.

### Team-level (Phase 1 — implemented, no API)

```
fifaOvr  = clamp(round(86 - (rank - 1) × 0.32), 58, 86)
top11Ovr = mean(highest 11 rated squad_players.overall_rating)
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
| **2** | Re-prioritise player sync + FIFA player fallback | Yes (`sync-squads`) | Pending |
| **3** | Star-weighted Top-11 | No (formula only) | Pending |
| **4** | Rank-order guardrail | No | Optional |
| **5** | WC 2026 live match ratings + in-game form | Yes (later) | Future |

---

## Target outcome

Nation OVR spread roughly **68–88**, with France/Argentina/Netherlands top-tier and lower FIFA ranks appropriately weaker, while squad quality still nudges nations up or down within that band.

---

## Tabulating ratings

```bash
node scripts/tabulate-team-ratings.mjs
```

Prints Top-11 only, FIFA anchor, and blended OVR for all 48 teams (reads existing `teams` + `squad_players` in Supabase — no API-Football calls).
