#!/usr/bin/env bash
# Install Tizen SDK CLI from ~/Downloads (non-interactive).
# Do NOT double-click the .bin file — macOS Archive Utility cannot open it.
#
# Usage:
#   bash scripts/install-tizen-sdk-cli.sh
#
set -euo pipefail
INSTALLER="${1:-$HOME/Downloads/web-cli_Tizen_SDK_10.0_macos-64.bin}"
TARGET="${TIZEN_SDK_HOME:-$HOME/tizen-studio}"

if [[ ! -f "$INSTALLER" ]]; then
  echo "Installer not found: $INSTALLER"
  echo "Run: npm run tv:store:tizen-setup -- --open"
  exit 1
fi

chmod +x "$INSTALLER"
echo "→ Installing Tizen SDK CLI to $TARGET …"
"$INSTALLER" --accept-license --no-java-check "$TARGET"

export PATH="$TARGET/tools:$TARGET/tools/ide/bin:$PATH"
PM="$TARGET/package-manager/package-manager-cli.bin"

echo "→ Installing Certificate Manager + Samsung Certificate Extension …"
"$PM" install --accept-license --no-java-check Certificate-Manager,cert-add-on

echo "→ Installing Samsung TV extension tools (no emulator) …"
"$PM" install --accept-license --no-java-check TV-SAMSUNG-Extension-Resources,TV-SAMSUNG-Extension-Tools || true

if ! grep -q 'tizen-studio/tools' "${HOME}/.zshrc" 2>/dev/null; then
  echo 'export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"' >> "${HOME}/.zshrc"
  echo "→ Added Tizen to ~/.zshrc"
fi

echo ""
echo "Done. Tizen CLI: $(tizen version 2>/dev/null || echo 'restart terminal')"
echo "Next: create a Samsung TV certificate (requires your Samsung login):"
echo "  open \"$TARGET/tools/certificate-manager/certificate-manager.app\""
