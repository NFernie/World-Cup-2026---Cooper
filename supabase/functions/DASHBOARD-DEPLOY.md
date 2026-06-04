# Deploy edge functions from Supabase Dashboard (browser)

Functions **2 and 3** need a `_shared` folder **inside** the function, not the parent `functions/_shared` folder.

## `sync-match-odds` (one file only)

Copy only:

- `sync-match-odds/index.ts`

## `sync-tournament-awards` (three files)

Create function name: `sync-tournament-awards`

| Path in dashboard editor | Copy from GitHub |
|--------------------------|------------------|
| `index.ts` | `supabase/functions/sync-tournament-awards/index.ts` |
| `_shared/awards-sync.ts` | `supabase/functions/sync-tournament-awards/_shared/awards-sync.ts` |
| `_shared/fifa-code-map.ts` | `supabase/functions/sync-tournament-awards/_shared/fifa-code-map.ts` |

First line of `index.ts` must import:

```ts
import { syncTournamentAwards } from "./_shared/awards-sync.ts";
```

**Not** `../_shared/` (that causes “module not found” in the dashboard).

## `sync-match-results` (three files)

Same layout as awards:

| Path in dashboard editor | Copy from GitHub |
|--------------------------|------------------|
| `index.ts` | `supabase/functions/sync-match-results/index.ts` |
| `_shared/awards-sync.ts` | `supabase/functions/sync-match-results/_shared/awards-sync.ts` |
| `_shared/fifa-code-map.ts` | `supabase/functions/sync-match-results/_shared/fifa-code-map.ts` |

## Secrets (dashboard)

Edge Functions → Secrets → `API_FOOTBALL_KEY` = your api-football.com key.
