#!/usr/bin/env bash
# Stream — install deps, DB, build, systemd (after code is on the VPS).
#
# Usage (on the server, from repo root or with absolute path to this script):
#   sudo bash scripts/vps-setup-app.sh /opt/stream/iptv-player
#
# Requires:
#   - .env in APP_DIR with AUTH_SECRET, STREAM_SESSION_SECRET, DATABASE_URL (see .env.example)
#   - Or: copy .env.example to .env and edit before running this script.
#
# Run as root; npm steps run as APP_USER.

set -euo pipefail

APP_DIR="${1:-}"
APP_USER="${APP_USER:-stream}"
SERVICE_NAME="${SERVICE_NAME:-stream}"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Run as root: sudo bash $0 /opt/stream/iptv-player" >&2
  exit 1
fi

if [ -z "$APP_DIR" ] || [ ! -d "$APP_DIR" ]; then
  echo "Usage: sudo bash $0 /path/to/iptv-player" >&2
  exit 1
fi

if ! id -u "$APP_USER" &>/dev/null; then
  echo "User $APP_USER does not exist. Run vps-bootstrap.sh first." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "No package.json in $APP_DIR — wrong directory?" >&2
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  if [ -f "$APP_DIR/.env.example" ]; then
    echo "Copying .env.example -> .env (you MUST edit secrets before production!)"
    install -m 600 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/.env.example" "$APP_DIR/.env"
  else
    echo "Missing $APP_DIR/.env — create it from .env.example" >&2
    exit 1
  fi
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

run_as_app() {
  sudo -u "$APP_USER" -H bash -lc "cd $(printf '%q' "$APP_DIR") && $*"
}

run_as_app "mkdir -p data"
run_as_app "npm ci"
run_as_app "npm run db:push && npm run predeploy"

UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/systemd/stream.service"

if [ ! -f "$TEMPLATE" ]; then
  echo "Missing template: $TEMPLATE" >&2
  exit 1
fi

sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__APP_USER__|$APP_USER|g" "$TEMPLATE" >"$UNIT"
chmod 644 "$UNIT"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo ""
echo "Service $SERVICE_NAME installed and started."
echo "  journalctl -u $SERVICE_NAME -f"
echo "  curl -sS http://127.0.0.1:3000/api/health"
echo ""
echo "Put Caddy/nginx on :443 → http://127.0.0.1:3000 when you have a domain."
echo ""
