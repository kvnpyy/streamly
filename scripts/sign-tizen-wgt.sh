#!/usr/bin/env bash
# Sign the Streamly Tizen .wgt using your Certificate Manager profile.
#
# Prerequisites:
#   1. Tizen SDK installed (bash scripts/install-tizen-sdk-cli.sh)
#   2. Certificate profile created in Certificate Manager
#
# Usage:
#   TIZEN_CERT_PROFILE=streamly-tv npm run tv:store:sign-tizen
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROFILE="${TIZEN_CERT_PROFILE:-streamly-tv}"
DIST="$ROOT/tv-apps/dist"
STAGE="$(mktemp -d)"
VERSION="$(node -pe "require('$ROOT/tv-apps/store-config.json').version")"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

export PATH="${HOME}/tizen-studio/tools:${HOME}/tizen-studio/tools/ide/bin:${PATH}"

if ! command -v tizen >/dev/null 2>&1; then
  echo "ERROR: 'tizen' command not found. Run: bash scripts/install-tizen-sdk-cli.sh"
  exit 1
fi

bash "$SCRIPT_DIR/export-tv-app-icons.sh"

mkdir -p "$STAGE/shared" "$DIST"
cp "$ROOT/tv-apps/tizen/config.xml" "$ROOT/tv-apps/tizen/index.html" "$ROOT/tv-apps/tizen/icon.png" "$STAGE/"
cp "$ROOT/tv-apps/shared/"* "$STAGE/shared/"

echo "→ Signing with profile: $PROFILE"
(
  cd "$STAGE"
  tizen package -t wgt -s "$PROFILE" -o "$DIST" -- .
)

SIGNED=$(ls -t "$DIST"/*.wgt 2>/dev/null | head -1)
if [[ -n "$SIGNED" ]]; then
  DEST="$DIST/streamly-samsung-tizen-${VERSION}-signed.wgt"
  mv -f "$SIGNED" "$DEST"
  echo ""
  echo "Done: $DEST"
  ls -la "$DEST"
else
  echo "ERROR: signing failed — is profile '$PROFILE' created in Certificate Manager?"
  exit 1
fi
