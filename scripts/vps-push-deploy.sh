#!/usr/bin/env bash
# Push local iptv-player tree to the VPS and rebuild + restart stream.
#
# From your Mac, in Terminal (not double‑click — macOS would open the file in an editor):
#
#   cd /path/to/iptv-player
#   cp scripts/vps-deploy.env.example scripts/.vps-deploy.env   # once; edit SSH target
#   npm run deploy:vps
#
# Or: STREAM_DEPLOY_SSH=ubuntu@host bash scripts/vps-push-deploy.sh
#
# Options:
#   --quick   Skip npm ci (faster for small code-only changes). Run a full deploy
#             after you change package.json / package-lock.json.
#
# Before rsync, the server copies the current app tree to a rollback snapshot (same
# owner as the app dir). After restart, curl hits STREAM_HEALTHCHECK_URL (default
# http://127.0.0.1:3000/api/health). On failure, the snapshot is restored and the
# service is started again. Set STREAM_DEPLOY_SKIP_HEALTHCHECK=1 to skip.
#
# Production policy: commit everything and merge local branches into HEAD before deploy.
# pre-deploy-check.sh blocks dirty trees and branches with commits not in HEAD.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.vps-deploy.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

QUICK=0
for a in "$@"; do
  if [ "$a" = "--quick" ]; then QUICK=1; fi
done

PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET="${STREAM_DEPLOY_SSH:-}"
if [ -z "$TARGET" ]; then
  echo "Set STREAM_DEPLOY_SSH, e.g.:" >&2
  echo "  cp scripts/vps-deploy.env.example scripts/.vps-deploy.env   # then edit" >&2
  echo "  STREAM_DEPLOY_SSH=ubuntu@iptvwebplayer.org bash $0" >&2
  exit 1
fi

REMOTE_DIR="${STREAM_REMOTE_DIR:-/opt/stream/iptv-player}"
REMOTE_BACKUP="${STREAM_REMOTE_BACKUP_DIR:-${REMOTE_DIR}.deploy-backup}"
if [ -n "${STREAM_REMOTE_RSYNC_STAGE:-}" ]; then
  REMOTE_STAGE="$STREAM_REMOTE_RSYNC_STAGE"
else
  REMOTE_STAGE=$(ssh "$TARGET" 'd=/tmp/iptv-player-deploy-$(id -un); mkdir -p "$d" && printf %s "$d"')
fi
HEALTH_URL="${STREAM_HEALTHCHECK_URL:-http://127.0.0.1:3000/api/health}"
SKIP_HEALTH="${STREAM_DEPLOY_SKIP_HEALTHCHECK:-0}"

echo "→ remote: snapshot for rollback → ${REMOTE_BACKUP}"
ssh "$TARGET" env REMOTE_DIR="$REMOTE_DIR" REMOTE_BACKUP="$REMOTE_BACKUP" bash -s <<'SNAPSHOT'
set -euo pipefail
if [ -d "$REMOTE_DIR" ] && [ -f "$REMOTE_DIR/package.json" ]; then
  sudo rm -rf "$REMOTE_BACKUP"
  sudo cp -a "$REMOTE_DIR" "$REMOTE_BACKUP"
  echo "Snapshot saved."
else
  echo "No existing app (first deploy) — rollback snapshot skipped."
fi
SNAPSHOT

echo "→ rsync → ${TARGET}:${REMOTE_STAGE}"
# Staging is under /tmp as the SSH user; merge into stream-owned app dir uses sudo.
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude data \
  --exclude .env \
  --exclude .env.local \
  --exclude '.DS_Store' \
  --exclude '._*' \
  "$PROJECT_DIR/" "${TARGET}:${REMOTE_STAGE}/"

echo "→ remote: sudo merge staging → ${REMOTE_DIR} (preserves .env + data/)"
ssh "$TARGET" env REMOTE_STAGE="$REMOTE_STAGE" REMOTE_DIR="$REMOTE_DIR" bash -s <<'MERGE'
set -euo pipefail
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if [ -f "${REMOTE_DIR}/.env" ]; then sudo cp -a "${REMOTE_DIR}/.env" "$TMP/.env"; fi
if [ -f "${REMOTE_DIR}/.env.local" ]; then sudo cp -a "${REMOTE_DIR}/.env.local" "$TMP/.env.local"; fi
if [ -d "${REMOTE_DIR}/data" ]; then sudo cp -a "${REMOTE_DIR}/data" "$TMP/data"; fi
# sudo cp -a preserves stream ownership — chown so the EXIT trap can rm the temp dir as this user.
sudo chown -R "$(id -un):$(id -gn)" "$TMP"
sudo rsync -aO --delete "${REMOTE_STAGE}/" "${REMOTE_DIR}/"
sudo chown -R stream:stream "${REMOTE_DIR}"
if [ -f "$TMP/.env" ]; then sudo cp -a "$TMP/.env" "${REMOTE_DIR}/.env" && sudo chown stream:stream "${REMOTE_DIR}/.env"; fi
if [ -f "$TMP/.env.local" ]; then sudo cp -a "$TMP/.env.local" "${REMOTE_DIR}/.env.local" && sudo chown stream:stream "${REMOTE_DIR}/.env.local"; fi
if [ -d "$TMP/data" ]; then sudo rm -rf "${REMOTE_DIR}/data" && sudo cp -a "$TMP/data" "${REMOTE_DIR}/data" && sudo chown -R stream:stream "${REMOTE_DIR}/data"; fi
MERGE

if [ "$QUICK" -eq 1 ]; then
  INNER="cd $(printf '%q' "$REMOTE_DIR") && npm run build && npm run db:push -- --force"
  echo "→ remote: npm run build + db:push + restart (--quick)"
else
  INNER="cd $(printf '%q' "$REMOTE_DIR") && npm ci && npm run build && npm run db:push -- --force"
  echo "→ remote: npm ci + build + db:push + restart"
fi

ssh "$TARGET" "sudo -u stream -H bash -lc $(printf '%q' "$INNER") && sudo systemctl restart stream"

if [ "$SKIP_HEALTH" = "1" ]; then
  echo "→ health check skipped (STREAM_DEPLOY_SKIP_HEALTHCHECK=1)"
  echo "Done."
  exit 0
fi

echo "→ remote: health check (${HEALTH_URL})"
set +e
ssh "$TARGET" env HEALTH_URL="$HEALTH_URL" REMOTE_DIR="$REMOTE_DIR" REMOTE_BACKUP="$REMOTE_BACKUP" bash -s <<'HEALTH'
set -euo pipefail
ok=0
for _ in $(seq 1 15); do
  body="$(curl -fsS --max-time 8 "$HEALTH_URL" 2>/dev/null || true)"
  if printf '%s' "$body" | python3 -c "import json,sys
try:
  d=json.load(sys.stdin)
  sys.exit(0 if d.get('ok') is True else 1)
except Exception:
  sys.exit(1)" 2>/dev/null; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" -eq 1 ]; then
  echo "Health OK."
  exit 0
fi
echo "Health check failed after retries." >&2
if [ ! -d "$REMOTE_BACKUP" ] || [ ! -f "$REMOTE_BACKUP/package.json" ]; then
  echo "No rollback snapshot — fix the server manually." >&2
  exit 1
fi
echo "Rolling back to snapshot…" >&2
sudo systemctl stop stream
sudo rm -rf "$REMOTE_DIR"
sudo cp -a "$REMOTE_BACKUP" "$REMOTE_DIR"
sudo chown -R stream:stream "$REMOTE_DIR"
sudo systemctl start stream
echo "Rollback finished; deploy failed." >&2
exit 1
HEALTH
health_rc=$?
set -e
if [ "$health_rc" -ne 0 ]; then
  exit "$health_rc"
fi

echo "Done."
