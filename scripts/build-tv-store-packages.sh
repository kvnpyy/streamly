#!/usr/bin/env bash
# Stage Tizen (.wgt) and webOS (.ipk) packages for store submission.
# Output is UNSIGNED — sign with Tizen Studio / LG CLI before uploading to stores.
#
# Usage:
#   bash scripts/build-tv-store-packages.sh
#   STREAMLY_ICON_BASE=https://iptvwebplayer.org bash scripts/build-tv-store-packages.sh
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST="$ROOT/tv-apps/dist"
STAGE="$(mktemp -d)"
VERSION="$(node -pe "require('$ROOT/tv-apps/store-config.json').version")"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

echo "→ Exporting icons…"
bash "$SCRIPT_DIR/export-tv-app-icons.sh"

mkdir -p "$DIST"

stage_platform() {
  local name="$1"
  local src="$ROOT/tv-apps/$name"
  local out="$STAGE/$name"
  mkdir -p "$out/shared"
  cp -R "$src/." "$out/"
  cp "$ROOT/tv-apps/shared/"* "$out/shared/"
  # Remove README from package payload
  rm -f "$out/README.md"
}

echo "→ Staging Tizen package…"
stage_platform tizen
(
  cd "$STAGE/tizen"
  zip -X -qr "$DIST/streamly-samsung-tizen-${VERSION}-unsigned.wgt" \
    config.xml index.html icon.png shared
)
echo "   $DIST/streamly-samsung-tizen-${VERSION}-unsigned.wgt"

echo "→ Staging webOS package…"
stage_platform webos
(
  cd "$STAGE/webos"
  zip -X -qr "$DIST/streamly-lg-webos-${VERSION}-unsigned.ipk" \
    appinfo.json index.html icon.png icon-80.png icon-130.png shared 2>/dev/null || \
  zip -X -qr "$DIST/streamly-lg-webos-${VERSION}-unsigned.ipk" \
    appinfo.json index.html icon.png shared
)
echo "   $DIST/streamly-lg-webos-${VERSION}-unsigned.ipk"

echo "→ Copying store listing snippets…"
cp "$ROOT/tv-apps/store-listings/"*.md "$DIST/" 2>/dev/null || true

cat <<EOF

Done.

Next steps (you must do these in each store console):
  1. Samsung: sign the .wgt in Tizen Studio, upload to Seller Office
  2. LG: sign with ares-package -s <profile>, upload to Seller Lounge
  3. Fire TV: submit hosted URL (no package) — see tv-apps/STORE_SUBMISSION.md

Full checklist: tv-apps/STORE_SUBMISSION.md
EOF
