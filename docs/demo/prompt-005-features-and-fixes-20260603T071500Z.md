# Demo summary — Prompt 005

**Timestamp (UTC):** 2026-06-03T07:15:00Z  
**Prompt:** Implement troubleshooting fixes, upgrades (fixtures, draw odds, team themes), onboarding/multi-pool UX; TestLiveAPI.md; commit to main.

---

## Prompt 005 summary

Delivered WC26 pool app improvements after live site was working: fixed GitHub Pages invite URLs, renamed Share link, corrected 48-team seed data, added fixtures page with local times and odds, draw scoring for odds leaderboard, per-pool national team themes, multi-pool home dashboard, join by invite or pool name, host auto-join, and backfill for hosts missing `pool_members` rows.

---

## Troubleshooting addressed

| # | Issue | Fix |
|---|--------|-----|
| 1 | Share/copy link 404 | `getInviteUrl()` / `getAppUrl()` include repo basename |
| 2 | Copy → Share link | UI label + Web Share API fallback |
| 3 | UNK teams | Migration + seed update to 2026 draw names |
| — | Can't access pools | Host backfill + auto-join on create; home lists all pools |

---

## Upgrades delivered

| # | Feature |
|---|---------|
| 1 | `/pools/:id/fixtures` — schedule, results, odds, assigned team highlight, local time |
| 2 | Draw → draw odds points for both teams' managers |
| 3 | `TeamThemeProvider` on pool routes only |
| 4 | Title **WC26** (browser + header) |

---

## Onboarding / multi-pool

| # | Feature |
|---|---------|
| 1 | `/join` — invite code or pool name |
| 2 | Home — sign in + all pools for email (neutral theme) |
| 3 | Separate `assigned_team_id` per `pool_members` row (already per pool; hosts now join each pool) |

---

## Artifacts

- `supabase/migrations/20260603000003_prompt005_updates.sql`
- `docs/TestLiveAPI.md`
- `web/src/lib/urls.ts`, `teamColors.ts`, `authRedirect.ts`

---

## Re-run demo

1. Apply migration: `supabase db push` or GitHub Actions.
2. Redeploy web workflow.
3. Sign in → home shows pools → open pool → Share link → Fixtures.
4. Follow `docs/TestLiveAPI.md` for API sync validation.

---

## Prompt 005 addendum (auth, themes, reveal animation)

### Auth — first time vs returning

| Visit | Behaviour |
|-------|-----------|
| **First sign-up** | Supabase sends **confirmation email** (`enable_confirmations = true` in `supabase/config.toml`). User must confirm once. |
| **Returning** | Magic link email → click → **straight to landing** (`/`) or stored join redirect. |
| **Already signed in** | `/login` redirects to home immediately. |

**Also enable in Supabase Dashboard:** Authentication → Providers → Email → **Confirm email** ON.

`web/src/lib/authStorage.ts` tracks verified emails locally for clearer login copy.

### Team themes (pool pages)

- `--pool-bg` gradient on `.pool-theme-shell` (full pool area background).
- Primary/secondary national colours on buttons, borders, fixtures highlight.
- Home/landing stays **neutral** (no team theme).

### Join reveal animation

After joining (or creating) a pool, `TeamRevealAnimation` cycles flag images through all teams, then reveals the assigned nation with flag + name (~4s), then navigates to the pool.

Files: `web/src/components/TeamRevealAnimation.tsx`, `web/src/hooks/useJoinReveal.ts`, `web/src/lib/flags.ts`.
