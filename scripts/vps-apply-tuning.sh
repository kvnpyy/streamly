#!/usr/bin/env bash
# Apply production tuning on the Ubuntu VPS (run ON the server as ubuntu with sudo).
# From laptop: ssh ubuntu@HOST 'bash -s' < scripts/vps-apply-tuning.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TUNING_DIR="$SCRIPT_DIR/vps-tuning"

if [ "$(id -u)" -ne 0 ]; then
  echo "Re-run with sudo: sudo bash $0" >&2
  exit 1
fi

echo "==> sysctl"
cp "$TUNING_DIR/99-streamly.conf" /etc/sysctl.d/99-streamly.conf
sysctl --system >/dev/null 2>&1 || sysctl -p /etc/sysctl.d/99-streamly.conf

echo "==> swap (2G safety net if missing)"
if ! swapon --show | grep -q .; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap enabled."
else
  echo "Swap already present — skipped."
fi

echo "==> stream systemd override"
mkdir -p /etc/systemd/system/stream.service.d
cp "$TUNING_DIR/stream.service.d-override.conf" /etc/systemd/system/stream.service.d/override.conf
systemctl daemon-reload

echo "==> Caddy"
if [ -f /etc/caddy/Caddyfile ]; then
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)"
fi
cp "$TUNING_DIR/Caddyfile.snippet" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

echo "==> fail2ban"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq fail2ban >/dev/null
cp "$TUNING_DIR/fail2ban-jail.local" /etc/fail2ban/jail.local
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> security package updates (non-interactive)"
apt-get update -qq
apt-get upgrade -y -qq \
  apparmor libapparmor1 cloud-init snapd \
  2>/dev/null || true

echo "==> restart stream"
systemctl restart stream
sleep 2
curl -fsS -m 10 http://127.0.0.1:3000/api/health >/dev/null && echo "Health OK after restart." || {
  echo "Health check failed — rolling back Caddy?" >&2
  exit 1
}

echo "Done. Optional: upgrade Node when convenient — apt list --upgradable | grep nodejs"
