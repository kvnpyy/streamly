#!/usr/bin/env bash
# One-time VPS monitoring setup: secret, vps-spec, cron, logrotate.
#
# On the server (as root):
#   sudo bash scripts/vps-monitoring-setup.sh /opt/stream/iptv-player
#
# Or from laptop:
#   ssh stream@HOST 'sudo bash -s' < scripts/vps-monitoring-setup.sh -- /opt/stream/iptv-player

set -euo pipefail

APP_DIR="${1:-}"
APP_USER="${APP_USER:-stream}"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Run as root: sudo bash $0 /opt/stream/iptv-player" >&2
  exit 1
fi

if [ -z "$APP_DIR" ] || [ ! -f "$APP_DIR/package.json" ]; then
  echo "Usage: sudo bash $0 /path/to/iptv-player" >&2
  exit 1
fi

MONITOR_DIR="$APP_DIR/data/monitor"
mkdir -p "$MONITOR_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/data"

ENV_FILE="$APP_DIR/.env"
if ! grep -q '^CAPACITY_METRICS_SECRET=' "$ENV_FILE" 2>/dev/null; then
  secret=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  echo "" >>"$ENV_FILE"
  echo "# VPS capacity monitoring (scripts/vps-monitor-collect.sh)" >>"$ENV_FILE"
  echo "CAPACITY_METRICS_SECRET=$secret" >>"$ENV_FILE"
  echo "Added CAPACITY_METRICS_SECRET to .env"
else
  echo "CAPACITY_METRICS_SECRET already in .env — left unchanged."
fi

SPEC_EXAMPLE="$APP_DIR/scripts/monitor/vps-spec.example.json"
SPEC_FILE="$MONITOR_DIR/vps-spec.json"
if [ ! -f "$SPEC_FILE" ] && [ -f "$SPEC_EXAMPLE" ]; then
  cp "$SPEC_EXAMPLE" "$SPEC_FILE"
  chown "$APP_USER:$APP_USER" "$SPEC_FILE"
  echo "Created $SPEC_FILE — edit vCPU/RAM/disk/bandwidth to match your plan."
fi

COLLECT="$APP_DIR/scripts/vps-monitor-collect.sh"
chmod +x "$COLLECT"
chown "$APP_USER:$APP_USER" "$COLLECT"

CRON_COLLECT="*/5 * * * * cd $APP_DIR && /usr/bin/env bash $APP_DIR/scripts/vps-monitor-collect.sh >> $APP_DIR/data/monitor/collect-cron.log 2>&1"
CRON_NOTIFY="15 * * * * cd $APP_DIR && /usr/bin/npm run monitor:notify >> $APP_DIR/data/monitor/notify-cron.log 2>&1"

sudo -u "$APP_USER" bash -s <<CRONSH
set -euo pipefail
( crontab -l 2>/dev/null | grep -v 'vps-monitor-collect.sh' | grep -v 'monitor:notify' || true
  echo '$CRON_COLLECT'
  echo '$CRON_NOTIFY'
) | crontab -
CRONSH
echo "Installed cron: metrics every 5 min, alert email hourly for user $APP_USER."

LOGROTATE="/etc/logrotate.d/streamly-monitor"
cat >"$LOGROTATE" <<EOF
$MONITOR_DIR/collect-cron.log
$MONITOR_DIR/notify-cron.log
$MONITOR_DIR/samples.jsonl {
  weekly
  rotate 4
  compress
  missingok
  notifempty
  copytruncate
}
EOF
echo "Installed logrotate at $LOGROTATE."

systemctl restart stream 2>/dev/null || true

echo ""
echo "Monitoring setup complete."
echo "  1. Edit $SPEC_FILE if plan specs differ from defaults."
echo "  2. Wait ~4h for baseline samples (or run: sudo -u $APP_USER bash -lc 'cd $APP_DIR && bash scripts/vps-monitor-collect.sh')"
echo "  3. Report: sudo -u $APP_USER bash -lc 'cd $APP_DIR && npm run monitor:report'"
echo "  4. JSON for Cursor: npm run monitor:report -- --json"
echo ""
