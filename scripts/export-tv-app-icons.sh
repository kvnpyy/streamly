#!/usr/bin/env bash
# Download PWA icons and generate store-required sizes.
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

resize() {
  local src="$1"
  local size="$2"
  local out="$3"
  if command -v sips >/dev/null 2>&1; then
    sips -z "$size" "$size" "$src" --out "$out" >/dev/null
    echo "→ ${size}×${size} → $out"
  else
    echo "⚠ sips not found — skip $out (install on macOS or resize manually)"
  fi
}

mkdir -p \
  "$ROOT/tv-apps/tizen" \
  "$ROOT/tv-apps/webos" \
  "$ROOT/tv-apps/firetv" \
  "$ROOT/tv-apps/androidtv"

fetch "$BASE/pwa-icon/512" "$ROOT/tv-apps/tizen/icon.png"
cp "$ROOT/tv-apps/tizen/icon.png" "$ROOT/tv-apps/webos/icon.png"
cp "$ROOT/tv-apps/tizen/icon.png" "$ROOT/tv-apps/firetv/icon-512.png"
cp "$ROOT/tv-apps/tizen/icon.png" "$ROOT/tv-apps/androidtv/icon-512.png"

resize "$ROOT/tv-apps/tizen/icon.png" 130 "$ROOT/tv-apps/webos/icon-130.png"
resize "$ROOT/tv-apps/tizen/icon.png" 80 "$ROOT/tv-apps/webos/icon-80.png"
resize "$ROOT/tv-apps/tizen/icon.png" 114 "$ROOT/tv-apps/firetv/icon-114.png"

echo "Done. Icons written for Tizen, webOS, Fire TV, and Android TV."
