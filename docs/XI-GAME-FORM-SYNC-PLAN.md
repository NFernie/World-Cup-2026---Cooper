# World Cup XI — daily match form sync

Real WC match ratings temporarily nudge **effective raw OVR** at read time. Baseline `overall_rating`, `rating_source`, and star-floor rules are unchanged.

**Related:** [XI-GAME-RATINGS-PLAN.md](./XI-GAME-RATINGS-PLAN.md) · [XI-GAME-SCORING-AND-FORM-PLAN.md](./XI-GAME-SCORING-AND-FORM-PLAN.md)

---

## Formula

| Match rating | Form % on stored raw |
|--------------|----------------------|
| 6.0 – 7.0 | 0% (neutral) |
| > 7.0 | `(rating − 7) × 1%` capped at **+2%** |
| < 6.0 | `(rating − 6) × 1%` capped at **−2%** |

Examples: 7.5 → +0.5%, 8.0 → +1.0%, 5.5 → −0.5%.

**Rules:** latest match only per player · min **45** minutes · DNP / low minutes → clear boost · **3-day decay** if no update.

---

## Sync (separate from baseline)

```bash
# Daily cron 04:45 UTC — sync-squad-form
curl "https://<project>.supabase.co/functions/v1/sync-squad-form"

# Status
curl ".../sync-squad-form?status=true"

# Debug reprocess
curl ".../sync-squad-form?force=true"
```

**API:** `GET /fixtures/players?fixture={id}` for FT matches in `public.matches` since last watermark (max 10/run).

**Writes:** `form_boost_pct`, `form_match_rating`, `form_fixture_ids`, `form_synced_at`, `squad_player_form_log`.

**Never writes:** `overall_rating`, `rating_source`, `baseline_*`, `has_continental_rating`.

---

## Read-time pipeline

```
stored raw (DB) → form % → league mult → nation clamp → star floor (pool uses stored raw)
```

Code: `formBoost.ts`, `playerRatingAdjust.ts`, `squads.ts`.

---

## Phased baseline rebaseline (remaining nations)

Top 10 done (~260 players). Continue without re-hitting top 10:

```bash
curl ".../sync-squads?force=true&includeRatings=true&fifaRankMin=11&fifaRankMax=20"
```

~260 API calls per 10-nation band. Re-run until `ratingsBudgetReached` is false.
