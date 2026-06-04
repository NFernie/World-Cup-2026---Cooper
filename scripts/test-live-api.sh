#!/usr/bin/env bash
# Prompt 007 — smoke-test API-Football + Supabase edge functions.
# Usage:
#   export API_FOOTBALL_KEY=...
#   export SUPABASE_URL=https://fyiegingyipqtxaiopng.supabase.co
#   export SUPABASE_SERVICE_ROLE_KEY=...
#   ./scripts/test-live-api.sh

set -euo pipefail

API_BASE="${API_BASE:-https://v3.football.api-sports.io}"
LEAGUE_ID="${API_FOOTBALL_LEAGUE_ID:-1}"
SEASON="${API_FOOTBALL_SEASON:-2026}"

red() { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
section() { printf '\n=== %s ===\n' "$*"; }

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    red "Missing env: $name"
    exit 1
  fi
}

api_get() {
  local path="$1"
  curl -sf -H "x-apisports-key: $API_FOOTBALL_KEY" "${API_BASE}${path}"
}

section "Prerequisites"
require_env API_FOOTBALL_KEY

section "1. League coverage (World Cup 2026)"
api_get "/leagues?id=${LEAGUE_ID}&season=${SEASON}" | head -c 2000
echo ""

section "2. Teams in competition (expect 48)"
teams_json=$(api_get "/teams?league=${LEAGUE_ID}&season=${SEASON}")
echo "$teams_json" | python3 - <<'PY'
import json, sys
d = json.load(sys.stdin)
teams = [r.get("team", {}) for r in d.get("response", [])]
print(f"results={d.get('results')} teams")
missing_code = [t.get("name") for t in teams if not (t.get("code") or "").strip()]
if missing_code:
    print("Teams with empty API code:", ", ".join(missing_code[:10]), ("..." if len(missing_code) > 10 else ""))
PY

section "3. Top scorers (Golden Boot source)"
scorers_json=$(api_get "/players/topscorers?league=${LEAGUE_ID}&season=${SEASON}" || echo '{"response":[]}')
echo "$scorers_json" | python3 - <<'PY'
import json, sys
d = json.load(sys.stdin)
rows = d.get("response", [])
print(f"topscorer rows={len(rows)}")
if rows:
    r = rows[0]
    p = r.get("player", {})
    print("sample:", p.get("name"), "goals=", (r.get("statistics") or [{}])[0].get("goals"))
else:
    print("No topscorers yet — Golden Boot names stay on DB placeholders until tournament goals exist.")
PY

section "4. Sample fixture list (for external_id backfill)"
api_get "/fixtures?league=${LEAGUE_ID}&season=${SEASON}&next=3" | python3 - <<'PY'
import json, sys
d = json.load(sys.stdin)
for fx in d.get("response", [])[:3]:
    f = fx.get("fixture", {})
    home = fx.get("teams", {}).get("home", {}).get("name")
    away = fx.get("teams", {}).get("away", {}).get("name")
    print(f"fixture_id={f.get('id')} {home} vs {away} status={f.get('status', {}).get('short')}")
PY

if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  section "5. Edge functions"
  for fn in sync-tournament-awards sync-match-odds sync-match-results; do
    echo "POST $fn ..."
    curl -sf -X POST "${SUPABASE_URL}/functions/v1/${fn}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" || red "$fn failed"
    echo ""
  done

  section "6. DB spot-check (teams awards)"
  curl -sf "${SUPABASE_URL}/rest/v1/teams?select=fifa_code,api_football_team_id,golden_boot_player_name,golden_glove_player_name&order=fifa_code" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    | python3 - <<'PY'
import json, sys
rows = json.load(sys.stdin)
mapped = sum(1 for r in rows if r.get("api_football_team_id"))
placeholders = [r["fifa_code"] for r in rows if r.get("golden_boot_player_name") in ("Squad forward", None)]
print(f"teams={len(rows)} api_football_team_id set={mapped}")
if placeholders:
    print("Still placeholder boot name:", len(placeholders), "teams (run awards sync after mapping + topscorers data)")
PY
else
  echo "Skip Supabase steps: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
fi

green "Done. See docs/TestLiveAPI.md and docs/API-INTEGRATION-GUIDE.md"
