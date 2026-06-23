#!/usr/bin/env bash
# Sign the Streamly Tizen .wgt using your Certificate Manager profile.
#
# Prerequisites:
#   1. Tizen SDK installed (bash scripts/tizen-sdk-setup.sh --open)
#   2. TV Extensions + Samsung Certificate Extension in Package Manager
#   3. Certificate profile created in Certificate Manager
#
# Usage:
#   TIZEN_CERT_PROFILE=streamly-tv npm run tv:store:sign-tizen
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROFILE="${TIZEN_CERT_PROFILE:-streamly-tv}"

export PATH="${HOME}/tizen-studio/tools:${HOME}/tizen-studio/tools/ide/bin:${PATH}"

if ! command -v tizen >/dev/null 2>&1; then
  echo "ERROR: 'tizen' command not found."
  echo ""
  echo "Install the Tizen SDK CLI first:"
  echo "  bash scripts/tizen-sdk-setup.sh --open"
  echo ""
  echo "Then add to ~/.zshrc:"
  echo '  export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"'
  exit 1
fi

bash "$SCRIPT_DIR/build-tv-store-packages.sh"

echo "→ Signing with profile: $PROFILE"
cd "$ROOT/tv-apps/tizen"
tizen package -t wgt -s "$PROFILE" .

echo ""
echo "Done. Signed .wgt is in tv-apps/tizen/"
ls -la "$ROOT/tv-apps/tizen"/*.wgt 2>/dev/null || ls -la ./*.wgt
