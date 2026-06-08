# World Cup XI Mini-Game — Implementation Plan

**Reference:** [38-0-0.com](https://38-0-0.com)  
**Target product:** World Cup 2026 Cooper tipping pool  
**Last updated:** 2026-06-08  
**Status:** Built (provisional squads). FUTBIN pipeline dropped — ratings come from API-Football.  

---

## Locked product decisions

| # | Decision | Your answer |
|---|----------|-------------|
| 1 | **Win condition** | Simulate the **full World Cup**. Outcome is either **“You won the World Cup”** or **“You were knocked out at Round XX”** (e.g. Group stage, Round of 32, Round of 16, Quarter-final, Semi-final, Final). |
| 2 | **Spin pool** | All **48 WC26 nations** (equal weight). |
| 3 | **Placement** | Link on the **Leaderboards page**, **below** the leaderboard sections. Route: `/pools/:poolId/xi-game`. |
| 4 | **Competition** | **Casual only** — no XI-game leaderboard. Optional **“Post to banter box”** on the result screen. |
| 5 | **Main sweep** | **Side game only** — does not affect pool points or odds leaderboard. |
| 6 | **Ratings** | **API-Football** (see [SPIN-DRAFT-RATINGS-STRATEGY.md](./SPIN-DRAFT-RATINGS-STRATEGY.md)). |
| 7 | **Squad data** | Launch with **provisional squads** from API-Football; refresh when **final 26-man** lists are published. Banner on game page until then. |

### Additional locked decisions (2026-06-08)

| Topic | Decision |
|-------|----------|
| **Modes** | **Classic only** (ratings visible; keep it simple). |
| **Re-spin** | **None**. |
| **Ratings** | **API-Football** season rating (0–10 → OVR) with FIFA-rank fallback. Optional manual overrides for stars — see [SPIN-DRAFT-RATINGS-STRATEGY.md](./SPIN-DRAFT-RATINGS-STRATEGY.md). |
| **Squad timing** | **Ship with provisional squads now**; update when FIFA announces final 26-man lists. Game page must state squads are provisional. |
| **Login** | Pool member required to play and post banter. |
| **Simulation** | Client-side for v1. |

---

## 1. What we are building

A **38-0-0-style spin draft** adapted for World Cup 2026:

```
Pick formation + mode
    → Spin random nation (1 of 48)
    → Draft 1 player from that squad into your XI
    → Repeat × 11
    → Simulate full tournament (groups + knockouts)
    → "You won the World Cup" OR "Knocked out at Round of 16"
    → Optional: post result to Banter Box
```

### Result copy examples

| Simulation outcome | User-facing message |
|--------------------|---------------------|
| Win final | **You won the World Cup** |
| Lose semi-final | **You were knocked out in the Semi-final** |
| Lose round of 16 | **You were knocked out in the Round of 16** |
| Fail to advance from group | **You were knocked out in the Group stage** |

Round labels should match existing app stage names where possible (`formatStage` in `web/src/lib/poolBoards.ts`).

---

## 2. UI placement

### Leaderboards page

Add a **card below all leaderboard sections** on `LeaderboardsPage.tsx`:

```
┌─────────────────────────────────────────────┐
│  🎮 World Cup Spin Draft                    │
│  Build an XI from 48 nations and see if     │
│  you can win the World Cup.                 │
│  [ Play now ]  or  [ Coming soon ]          │
└─────────────────────────────────────────────┘
```

- Link to `xi-game` once provisional squad sync has run.
- Game hub shows banner: *Provisional squads — ratings and players will update when FIFA announces final 26-man lists.*

### Game route

| Route | Page |
|-------|------|
| `/pools/:poolId/xi-game` | Hub: rules, formation picker, start game |
| `/pools/:poolId/xi-game/play/:sessionId` | Draft board (11 rounds) |
| `/pools/:poolId/xi-game/result/:sessionId` | Outcome + banter share |

Register routes in `web/src/App.tsx` under the existing `PoolShell` layout.

---

## 3. Banter box integration

Reuse `pool_banter_messages` (max **500 characters**).

### Result screen

After simulation, show:

- Primary: **Play again**
- Secondary: **Post to banter box** (only if user is a pool member)

### Pre-filled banter templates

**Won:**
```
🏆 Won the World Cup in Spin Draft! Formation 4-3-3 · Squad OVR 89 · Classic mode
```

**Knocked out:**
```
😤 Knocked out in the Quarter-final — Spin Draft XI (OVR 84, 4-3-3). Who beats that?
```

User can edit before posting. Insert via existing `BanterBox` pattern (`pool_banter_messages.insert`).

No new tables required for banter — only optional `xi_game_sessions` stores the structured result if you want “Play again” history later (not required for casual v1).

---

## 4. Data strategy: API-Football only

**Full analysis:** [SPIN-DRAFT-RATINGS-STRATEGY.md](./SPIN-DRAFT-RATINGS-STRATEGY.md)

| Data | Source |
|------|--------|
| Squad (name, position, photo) | API-Football `/players/squads?team=` |
| OVR for Classic mode | API-Football `/players?team=&season=2026` → `rating` × 10 |
| Overrides (optional) | Small CSV or admin edits for star players |

Gameplay reads **only Postgres** — same pattern as 38-0-0’s preloaded dataset.

**Provisional launch:** Sync now; `squads_provisional: true` until FIFA confirms final 26.

```mermaid
flowchart LR
  A[sync-squads edge function] --> B[squad_players table]
  B --> C[Optional manual overrides]
  C --> D[Spin Draft UI]
```

---

## 5. Tournament simulation (outline)

### Structure (2026 format)

- **12 groups of 4** — your XI does not replace a real nation; simulation uses **squad strength** vs fictional opponents.
- Simplified v1: treat each match as win/loss based on **XI OVR**, position fit, and random variance.
- Progress: **3 group matches** → if qualify → **R32 → R16 → QF → SF → Final**.

### Knock-out round labels (for “knocked out at…”)

| Internal stage | User message |
|----------------|--------------|
| `group` | Group stage |
| `round_of_32` | Round of 32 |
| `round_of_16` | Round of 16 |
| `quarter_final` | Quarter-final |
| `semi_final` | Semi-final |
| `final` | Final (if lost) |
| `champion` | You won the World Cup |

### Inputs to simulation

- Average `overall_rating` of XI (position-weighted like 38-0-0).
- Classic mode shows **OVR only** (from API rating × 10).

### Output JSON (stored on session)

```json
{
  "outcome": "knocked_out",
  "exit_round": "quarter_final",
  "squad_ovr": 87,
  "formation": "4-3-3",
  "mode": "classic",
  "group_record": "2W-0D-1L"
}
```

Tune win probabilities in `web/src/lib/xiGame/simulate.ts` with playtesting — target: winning the World Cup should be rare (~1–5% for strong drafts).

---

## 6. Database schema (draft)

```sql
-- Footballers (not pool members)
squad_players (
  id uuid primary key,
  team_id uuid references teams(id),
  api_football_player_id int,
  name text not null,
  position text not null,        -- normalized: GK | DEF | MID | FWD
  position_detail text,          -- LB, ST, etc.
  shirt_number int,
  photo_url text,
  overall_rating int not null,
  attr_pace int, attr_shooting int, attr_passing int,
  attr_dribbling int, attr_defending int, attr_physical int,
  rating_source text,            -- api | fallback | manual
  synced_at timestamptz
);

-- Optional: persist games for banter + play again
xi_game_sessions (
  id uuid primary key,
  pool_id uuid references pools(id),
  user_id uuid references auth.users(id),
  formation text not null,
  mode text not null default 'classic',
  status text not null,          -- drafting | complete
  result_json jsonb,
  created_at timestamptz
);

xi_game_picks (
  session_id uuid references xi_game_sessions(id),
  round int,
  spun_team_id uuid references teams(id),
  squad_player_id uuid references squad_players(id),
  slot_position text,
  was_respin boolean default false,
  primary key (session_id, round)
);

-- Feature flag
app_settings (
  key text primary key,
  value jsonb
);
-- e.g. { "xi_game_enabled": false } until squads_ready
```

**RLS:** `squad_players` — authenticated read. `xi_game_sessions` — insert/select own rows + same `pool_id` membership as banter.

---

## 7. Engineering phases

### Phase A — Scaffold (can start now, before squads)

- [ ] Route `/pools/:poolId/xi-game` + “Coming soon” card on `LeaderboardsPage`
- [ ] `xiGame/` lib: formations, position eligibility, spin (48 nations)
- [ ] Draft UI shell with mock data (3 nations) for UX review
- [ ] Simulation stub returning random exit round
- [ ] Result screen + “Post to banter box” wire-up

### Phase B — Data (after final 26-man squads)

- [ ] Migration: `squad_players`, `xi_game_sessions`, `xi_game_picks`
- [ ] Edge function `sync-squads` + cron
- [ ] Optional `data/spin-draft-rating-overrides.csv` + import script for star players
- [ ] Admin page: sync status, unmatched players, manual OVR override
- [ ] Flip `xi_game_enabled` → enable Leaderboards link

### Phase C — Polish

- [ ] Classic / Expert modes
- [ ] One re-spin per game
- [ ] Mobile-first pitch diagram
- [ ] Simulation balance pass

**Explicitly out of scope:**

- Expert mode, re-spins, XI-game leaderboard, pool points, live external API during gameplay

---

## 8. API quota estimate

| Job | API-Football calls | Frequency |
|-----|-------------------|-----------|
| Full squad sync | ~48 | Once when squads announced; weekly during WC |
| Rating overrides CSV | 0 | Optional one-time |
| Gameplay | 0 | — |

Existing cron budget for fixtures/results/odds is unchanged.

---

## 10. Bottom line

| Topic | Answer |
|-------|--------|
| Game type | 38-0-0-style spin draft → **full WC tournament sim** |
| Win message | **You won the World Cup** or **knocked out at Round X** |
| Data | **API-Football** for squads + OVR (stored in DB) |
| Where it lives | Link **below leaderboards** in each pool |
| Social | Optional **banter box** post — no competitive leaderboard |
| When to ship data | **Provisional squads now**; final 26-man update later |
| Modes / re-spin | **Classic only**, **no re-spins** |

---

*Related: [ProgressSummary.md](../ProgressSummary.md), [TestLiveAPI.md](./TestLiveAPI.md), [Banter migration](../supabase/migrations/20260614000013_pool_banter_box.sql)*
