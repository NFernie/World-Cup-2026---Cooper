# World Cup 2026 — Cooper Tipping Pool

Private multi-pool tipping competition for FIFA World Cup 2026. Each player is assigned a national team; points come from **betting odds when that team wins**. Two leaderboards: **tournament standing** (team progress) and **odds points** (underdog-friendly).

## Docs

- [PLAN.md](./PLAN.md) — product plan + Developer Responses
- [docs/demo/](./docs/demo/) — timestamped demo re-run summaries per prompt

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite, React, TypeScript, Tailwind CSS |
| Backend | Supabase (Postgres, Auth username and password, RLS, Edge Functions) |
| External | API-Football (server-side sync) |

## Quick start

### 1. Supabase

```bash
# Install Supabase CLI, link project, then:
supabase db push
```

Set edge function secrets: `API_FOOTBALL_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `API_FOOTBALL_LEAGUE_ID`, `API_FOOTBALL_SEASON`.

Mark your user as super-admin:

```sql
update public.profiles set is_super_admin = true where email = 'you@example.com';
```

### 2. Web app

```bash
cd web
cp .env.example .env.local
# Edit VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 3. Flows

- **Host:** Sign in → Create pool → copy invite link (`/join/{invite_code}`)
- **Player:** Open invite → sign in → display name → auto team assignment
- **Admin:** `/admin` — override scores, reassign teams

## Scoring (summary)

When a player's assigned team **wins** a finished match, they earn points equal to that side's **pre-match decimal win odds** (fetched ~2 hours before kickoff). Draws/losses = 0. See `recalculate_pool_member_points()` in migrations.

## License

Private project — Cooper pool.
