#!/usr/bin/env bash
# Restart stream when the local health check fails twice in a row.
# A wedged Node process stays "active" in systemd and will not hit Restart=.
set -euo pipefail

URL="${STREAM_HEALTHCHECK_URL:-http://127.0.0.1:3000/api/health}"
STATE_DIR=/run/stream-healthcheck
FAILS="$STATE_DIR/fails"
LOCK="$STATE_DIR/lock"

mkdir -p "$STATE_DIR"
exec 9>"$LOCK"
if ! flock -n 9; then
  exit 0
fi

state="$(systemctl show -p ActiveState --value stream || true)"
case "$state" in
  activating|deactivating)
    exit 0
    ;;
esac

if curl -fsS --max-time 5 "$URL" | grep -q '"ok":true'; then
  echo 0 >"$FAILS"
  exit 0
fi

n=0
if [ -f "$FAILS" ]; then
  n="$(tr -cd '0-9' <"$FAILS")"
  n="${n:-0}"
fi
n=$((n + 1))
echo "$n" >"$FAILS"
echo "stream health check failed (${n})"

if [ "$n" -ge 2 ]; then
  echo 0 >"$FAILS"
  echo "restarting stream.service"
  systemctl restart stream
fi
