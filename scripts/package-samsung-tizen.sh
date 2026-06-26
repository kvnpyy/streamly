#!/usr/bin/env bash
# Build a clean signed Samsung .wgt (only runtime files — no markdown guides).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIZEN_DIR="$ROOT/tv-apps/tizen"
DIST="$ROOT/tv-apps/dist"
PROFILE="${TIZEN_CERT_PROFILE:-streamly-tv}"

VERSION="$(grep -E '^\s+version="' "$TIZEN_DIR/config.xml" | sed -E 's/.*version="([^"]+)".*/\1/')"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

export PATH="${HOME}/tizen-studio/tools:${HOME}/tizen-studio/tools/ide/bin:${PATH:-}"

if ! command -v tizen >/dev/null 2>&1; then
  echo "tizen CLI not found. Install Tizen Studio and add to PATH." >&2
  echo "See tv-apps/tizen/DOWNLOAD_LINKS.md" >&2
  exit 1
fi

mkdir -p "$DIST"
rm -f "$STAGE"/*

cp "$TIZEN_DIR/config.xml" "$TIZEN_DIR/index.html" "$TIZEN_DIR/icon.png" "$STAGE/"
cp -R "$ROOT/tv-apps/shared" "$STAGE/"

echo "→ Packaging Streamly v${VERSION} with profile: ${PROFILE}"
cd "$STAGE"
tizen package -t wgt -s "$PROFILE" -o "$DIST" -- .

BUILT=""
for f in "$DIST"/*.wgt; do
  [ -f "$f" ] || continue
  BUILT="$f"
  break
done

if [ -z "$BUILT" ]; then
  echo "No .wgt produced in $DIST" >&2
  exit 1
fi

OUT="$DIST/streamly-samsung-tizen-${VERSION}-signed.wgt"
rm -f "$OUT" "$DIST/Streamly.wgt"
mv -f "$BUILT" "$OUT"

echo ""
echo "✓ Signed package: $OUT"
echo "  Files inside:"
unzip -l "$OUT" | awk 'NR>3 && NF>0 && $1 !~ /^-/ {print}'
echo ""
echo "Upload this file in Seller Office → App Package → Request New Release."
