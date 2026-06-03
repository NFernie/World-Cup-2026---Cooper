# Demo summary — Prompt 003

**Timestamp (UTC):** 2026-06-03T04:07:47Z  
**Prompt:** Run / implement PLAN.md; use Developer Response lines; commit to main; capture demo summaries.

## Developer decisions applied (from PLAN.md)

| Area | Decision |
|------|----------|
| UI | Mobile-first, FIFA-adjacent greens/gold, dark/light toggle, shadcn-style components, casual tone |
| Auth | Magic link (E1); anyone with pool invite URL can join |
| Pools | Multi-pool; host creates; unique invite per pool |
| Scoring | Assigned team for full tournament; points = decimal win odds when team wins |
| Leaderboards | (1) Tournament team standing (2) Odds-weighted user points |
| Team assignment | Round-robin queue: fill 48 unique teams per round, then repeat; co-manager banner |
| Results | Path C hybrid: API-Football edge functions + super-admin override |
| API cadence | Scores after FT only; odds ~2h before kickoff; server-to-server |

## What was implemented

### Supabase (`supabase/`)

- `migrations/20260603000000_initial_schema.sql` — schema, RLS, `join_pool`, `assign_team_for_pool_member`, `recalculate_pool_member_points`, leaderboard views
- `migrations/20260603000001_seed_teams.sql` — 48 placeholder nations
- `functions/sync-match-results/` — finished fixtures from API-Football
- `functions/sync-match-odds/` — odds window sync
- `config.toml` — auth/email baseline

### Frontend (`web/`)

- Vite + React 19 + TypeScript + Tailwind 4
- Magic link login, create pool, join via `/join/:inviteCode`
- Pool dashboard: assigned team, co-manager message, dual leaderboards
- Super-admin: score override, team reassignment

## How to re-run in a live demo

1. Ensure `PLAN.md` on `main` includes **Developer Response** sections filled in.
2. Prompt: *"Implement PLAN.md per Developer Responses; commit to main; write demo summaries."*
3. Agent scaffolds `web/` + `supabase/`, runs `npm run build` in `web/`.
4. **You configure Supabase:**
   - Create project; run migrations (`supabase db push` or SQL editor).
   - Copy URL + anon key → `web/.env.local`
   - Set secrets: `API_FOOTBALL_KEY`, service role for edge functions.
   - Cron: invoke `sync-match-results` every 5 min (match days); `sync-match-odds` hourly.
   - Set one user `profiles.is_super_admin = true`.
5. `cd web && npm run dev` → open http://localhost:5173

## Post-setup checklist

- [ ] `web/.env.local` from `.env.example`
- [ ] Migrations applied
- [ ] Super-admin flag on your user
- [ ] Import/sync match fixtures (manual seed or API when WC 2026 league id live)
- [ ] Deploy SPA (Vercel/Netlify) + update Supabase redirect URLs

## Artifacts

- `web/` — React app
- `supabase/` — DB + edge functions
- `docs/demo/prompt-*.md` — this series
