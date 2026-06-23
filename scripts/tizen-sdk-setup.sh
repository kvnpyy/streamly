#!/usr/bin/env bash
# Verified Tizen SDK download URLs for Streamly Samsung TV packaging.
# Samsung moved developer.tizen.org → samsungtizenos.com (docs only, no obvious download).
# These direct links on download.tizen.org were checked live 2026-06-23.
#
# Usage:
#   bash scripts/tizen-sdk-setup.sh           # print links + install steps
#   bash scripts/tizen-sdk-setup.sh --open    # open CLI installer in browser (recommended)
#   bash scripts/tizen-sdk-setup.sh --open-ide # open smaller Web IDE (~700 MB)
#   bash scripts/tizen-sdk-setup.sh --open-full # open full Baseline IDE (~1.8 GB)
#
set -euo pipefail

BASE="https://download.tizen.org/sdk/Installer/tizen-sdk_10.0"
CLI_MAC="${BASE}/web-cli_Tizen_SDK_10.0_macos-64.bin"
IDE_MAC="${BASE}/web-ide_Tizen_SDK_10.0_macos-64.dmg"
FULL_MAC="https://download.tizen.org/sdk/Installer/Latest/Baseline_Tizen_Studio_macos-64.dmg"
INDEX="${BASE}/"
DOCS_TV="https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html"
TOOLS_PAGE="https://samsungtizenos.com/tools-download/"
SELLER_TV="https://seller.samsungapps.com/tv/"

open_url() {
  if command -v open >/dev/null 2>&1; then
    open "$1"
  else
    echo "Open in browser: $1"
  fi
}

case "${1:-}" in
  --open)       open_url "$CLI_MAC" ;;
  --open-ide)   open_url "$IDE_MAC" ;;
  --open-full)  open_url "$FULL_MAC" ;;
  --open-index) open_url "$INDEX" ;;
  "") ;;
  *)
    echo "Unknown flag: $1"
    echo "Use: --open | --open-ide | --open-full | --open-index"
    exit 1
    ;;
esac

cat <<EOF

═══════════════════════════════════════════════════════════════
 Streamly — Samsung Tizen SDK setup (macOS)
═══════════════════════════════════════════════════════════════

WHY YOU GOT LOST
  • developer.tizen.org/download → redirects to samsungtizenos.com (docs hub)
  • The page you opened (.NET / VS Code) is NOT the TV web-app installer
  • Downloads live on download.tizen.org (direct links below)

RECOMMENDED FOR STREAMLY (web TV app, sign + package only)
  CLI installer (~326 MB) — enough for certificate + tizen package commands:
  $CLI_MAC

  After download, in Terminal:
    cd ~/Downloads
    chmod +x web-cli_Tizen_SDK_10.0_macos-64.bin
    ./web-cli_Tizen_SDK_10.0_macos-64.bin

  Default install folder: ~/tizen-studio

ALTERNATIVE INSTALLERS
  Web IDE only (~699 MB, GUI + Package Manager):
  $IDE_MAC

  Full Baseline IDE (~1.8 GB, everything):
  $FULL_MAC

  Browse all SDK 10.0 files:
  $INDEX

AFTER INSTALL — required Samsung TV extensions
  1. Run Package Manager:
       ~/tizen-studio/package-manager/package-manager.bin
     (or launch from Tizen Studio → Tools → Package Manager)
  2. Extension SDK tab → Install:
       • TV Extensions (latest)
       • Samsung Certificate Extension (must be 2.0.73+)
  Guide: $DOCS_TV

ADD TIZEN TO YOUR SHELL (add to ~/.zshrc)
  export PATH="\$HOME/tizen-studio/tools:\$HOME/tizen-studio/tools/ide/bin:\$PATH"

THEN — sign Streamly (from project root)
  npm run tv:store:package
  npm run tv:store:sign-tizen

TV Seller Office (store submission, NOT Galaxy mobile store):
  $SELLER_TV

Optional tools page (must pick macOS + CLI on the page):
  $TOOLS_PAGE

EOF
