#!/usr/bin/env bash
# Stream — first boot on Ubuntu 24.04 VPS (OVH, Hetzner, etc.)
#
# Run as root after SSH works:
#   curl -fsSL ...   # or: scp this file + stream.service to the server
#   sudo bash scripts/vps-bootstrap.sh
#
# Creates user `stream`, opens UFW (22, 80, 443), installs build tools + Node.js.
# Does NOT clone your repo or edit .env (see vps-setup-app.sh).

set -euo pipefail

APP_USER="${APP_USER:-stream}"
NODE_MAJOR="${NODE_MAJOR:-22}"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

if ! grep -qi ubuntu /etc/os-release 2>/dev/null; then
  echo "Warning: this script targets Ubuntu; continuing anyway." >&2
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git build-essential ufw

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# App user (non-interactive)
if ! id -u "$APP_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$APP_USER"
fi
usermod -aG sudo "$APP_USER"

# SSH keys: let stream log in the same way root does (first boot only)
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  AK="/home/$APP_USER/.ssh/authorized_keys"
  if [ ! -s "$AK" ]; then
    install -m 600 -o "$APP_USER" -g "$APP_USER" /root/.ssh/authorized_keys "$AK"
  fi
fi

# Node.js (NodeSource LTS)
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
apt-get install -y nodejs

install -d -o "$APP_USER" -g "$APP_USER" /opt/stream
chown "$APP_USER:$APP_USER" /opt/stream

echo ""
echo "Bootstrap done."
echo "  • User: $APP_USER  (sudo enabled; SSH key copied from root if empty)"
echo "  • App dir: /opt/stream (owned by $APP_USER)"
echo "  • Node: $(node -v)  npm: $(npm -v)"
echo ""
echo "Next (as $APP_USER on the server):"
echo "  1. Put the app in /opt/stream/iptv-player (git clone or rsync from your laptop)"
echo "  2. bash scripts/vps-setup-app.sh /opt/stream/iptv-player"
echo ""
