#!/usr/bin/env bash
# Sync TMDB weekly trending per country (run from cron as stream user).
#
# Crontab example (Mondays 06:00 UTC):
#   0 6 * * 1 /opt/stream/iptv-player/scripts/cron-sync-tmdb-regions.sh
#
# Override regions: DISCOVERY_REGIONS=US,GB,AU,MX

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
[ -f .env ] && . ./.env
[ -f .env.local ] && . ./.env.local
set +a

LOG="${STREAM_DISCOVERY_TMDB_LOG:-$ROOT/data/discovery-tmdb-cron.log}"
mkdir -p "$(dirname "$LOG")"
REGIONS="${DISCOVERY_REGIONS:-US,GB,AU,MX}"
BASE_URL="${STREAM_DISCOVERY_BASE_URL:-http://127.0.0.1:3000}"

CURL_ARGS=(-fsS -X POST)
if [ -n "${DISCOVERY_CRON_SECRET:-}" ]; then
  CURL_ARGS+=(-H "x-discovery-cron-secret: ${DISCOVERY_CRON_SECRET}")
fi

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG"
}

log "TMDB regional sync start (regions=$REGIONS)"
IFS=',' read -ra RS <<< "$REGIONS"
for raw in "${RS[@]}"; do
  region="${raw// /}"
  [ -z "$region" ] && continue
  if curl "${CURL_ARGS[@]}" \
    "${BASE_URL}/api/discovery/sync-tmdb?region=${region}" >> "$LOG" 2>&1; then
    log "OK region=$region"
  else
    log "FAILED region=$region (exit $?)"
  fi
done
log "TMDB regional sync done"
