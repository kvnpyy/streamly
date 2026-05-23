#!/usr/bin/env bash
# Dev server reachable on LAN + Next.js allowedDevOrigins for your machine IP.
# Optional: next.config.ts auto-adds non-loopback IPv4s when NEXT_DEV_LAN_NO_AUTODISCOVER≠1.
# Still export NEXT_DEV_LAN_HOSTS for Docker-only IPs or when auto-discovery misses yours.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NEXT_BIN="$ROOT/node_modules/.bin/next"
if [[ ! -x "$NEXT_BIN" ]]; then
  echo "Run npm install in $ROOT first." >&2
  exit 1
fi

detect_lan_ip() {
  local ip=""
  if [[ "$(uname -s)" == "Darwin" ]]; then
    for iface in en0 en1 en2; do
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      [[ -n "$ip" ]] && echo "$ip" && return 0
    done
  elif command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [[ -n "$ip" ]] && echo "$ip" && return 0
  fi
  return 1
}

if [[ -z "${NEXT_DEV_LAN_HOSTS:-}" ]]; then
  if ip="$(detect_lan_ip)"; then
    export NEXT_DEV_LAN_HOSTS="$ip"
    echo "[dev-lan] NEXT_DEV_LAN_HOSTS=$NEXT_DEV_LAN_HOSTS (auto). Override in .env.local if wrong." >&2
  else
    echo "[dev-lan] Could not detect LAN IP. Set NEXT_DEV_LAN_HOSTS=10.x.x.x in .env.local to match how you open the site." >&2
  fi
fi

exec "$NEXT_BIN" dev -H 0.0.0.0 "$@"
