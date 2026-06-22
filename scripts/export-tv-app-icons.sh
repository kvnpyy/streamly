#!/usr/bin/env bash
# Download PWA icons from a running Streamly instance into tv-apps/ for store packages.
#
# Usage:
#   bash scripts/export-tv-app-icons.sh
#   STREAMLY_ICON_BASE=https://iptvwebplayer.org bash scripts/export-tv-app-icons.sh
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE="${STREAMLY_ICON_BASE:-https://iptvwebplayer.org}"

fetch() {
  local url="$1"
  local out="$2"
  echo "→ $url → $out"
  curl -fsSL "$url" -o "$out"
}

mkdir -p "$ROOT/tv-apps/tizen" "$ROOT/tv-apps/webos"

fetch "$BASE/pwa-icon/512" "$ROOT/tv-apps/tizen/icon.png"
cp "$ROOT/tv-apps/tizen/icon.png" "$ROOT/tv-apps/webos/icon.png"

echo "Done. Icons written for Tizen and webOS wrappers."
