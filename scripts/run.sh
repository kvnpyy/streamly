#!/usr/bin/env bash
# Stream — IPTV Player run script
# One script that handles install / start / stop / status / logs / autostart.
# Designed to be invoked via `npm run app:*` or by the macOS .app bundle.

set -u

# ---- locate project root ---------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"
APP_DIR="$HOME/Library/Application Support/IPTV-Stream"
LOG_FILE="$APP_DIR/server.log"
PID_FILE="$APP_DIR/server.pid"
HTTPS_PID_FILE="$APP_DIR/https-proxy.pid"
BIND_MODE_FILE="$APP_DIR/bind.mode"
LAUNCHD_LABEL="local.iptv.stream"
# Multi-device: bind 0.0.0.0 by default. Use STREAM_BIND_LAN=0 or npm run app:start:local for localhost-only.
STREAM_BIND_LAN="${STREAM_BIND_LAN:-1}"
# When LAN is on, serve HTTPS on HTTPS_PORT (Next stays on PORT). iOS Safari “HTTPS Only” blocks plain http://LAN URLs.
HTTPS_PORT="${HTTPS_PORT:-3443}"
case "$(printf '%s' "${STREAM_BIND_LAN:-1}" | tr '[:upper:]' '[:lower:]')" in
  0 | false | no | off | local | localhost)
    STREAM_USE_HTTPS="${STREAM_USE_HTTPS:-0}"
    ;;
  *)
    STREAM_USE_HTTPS="${STREAM_USE_HTTPS:-1}"
    ;;
esac
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"

mkdir -p "$APP_DIR"

# ---- helpers ---------------------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

# Next CLI directly — avoids npm wrapper PID confusion and survives scripts cleanly.
next_executable() {
  printf '%s\n' "$PROJECT_DIR/node_modules/.bin/next"
}

sanitize_pid_files() {
  if [ -s "$PID_FILE" ]; then
    local p
    p="$(tr -d '[:space:]' <"$PID_FILE")"
    if [ -z "$p" ] || ! kill -0 "$p" 2>/dev/null; then
      rm -f "$PID_FILE"
    fi
  fi
  if [ -s "$HTTPS_PID_FILE" ]; then
    local hp
    hp="$(tr -d '[:space:]' <"$HTTPS_PID_FILE")"
    if [ -z "$hp" ] || ! kill -0 "$hp" 2>/dev/null; then
      rm -f "$HTTPS_PID_FILE"
    fi
  fi
}

process_alive_from_pidfile() {
  [ -s "$PID_FILE" ] || return 1
  local p
  p="$(tr -d '[:space:]' <"$PID_FILE")"
  [ -n "$p" ] && kill -0 "$p" 2>/dev/null
}

service_responds() {
  curl -fsS "$URL/api/xtream" -o /dev/null -m 2 2>/dev/null ||
    curl -fsS "$URL/" -o /dev/null -m 2 2>/dev/null
}

clear_tcp_listeners() {
  local port="$1"
  local label="${2:-port}"
  local pids
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "→ Clearing stale listener on ${label} ${port}…"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.45
  fi
}

# Prefer targeted kills so another dev server on :3000 isn’t destroyed by mistake.
clear_stream_listener_on_port() {
  local port="$1"
  local label="${2:-HTTP}"
  local pids pid cmd killed=0
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [ -z "$pids" ] && return 0
  for pid in $pids; do
    cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    case "$cmd" in
      *"/next"*start*|*"next start"*|*next-server*|*"https-proxy-front.cjs"*)
        echo "→ Clearing leftover Stream listener (${label} ${port}, pid ${pid})…"
        kill -9 "$pid" 2>/dev/null || true
        killed=1
        ;;
    esac
  done
  [ "$killed" = "1" ] && sleep 0.45
}

recover_next_pid_if_needed() {
  sanitize_pid_files
  process_alive_from_pidfile && return 0
  service_responds || return 1
  local pid
  pid="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1)"
  [ -n "$pid" ] || return 1
  echo "$pid" >"$PID_FILE"
}

resolve_node() {
  # Try common locations Finder/launchd won't see by default.
  for candidate in \
    "$(command -v node 2>/dev/null)" \
    "/opt/homebrew/bin/node" \
    "/usr/local/bin/node" \
    "$HOME/.nvm/versions/node/$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin/node" \
    "$HOME/.volta/bin/node" \
    "$HOME/.fnm/aliases/default/bin/node"; do
    if [ -n "${candidate:-}" ] && [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_node() {
  NODE_BIN="$(resolve_node || true)"
  if [ -z "${NODE_BIN:-}" ]; then
    echo "Error: Node.js is not installed or not in PATH." >&2
    echo "Install it from https://nodejs.org or with 'brew install node'." >&2
    exit 1
  fi
  NPM_BIN="$(dirname "$NODE_BIN")/npm"
  export PATH="$(dirname "$NODE_BIN"):$PATH"
}

# Healthy when Next answers HTTP OR our pidfile points at a live process.
# Port-only checks caused false “already running” after crashes (blank UI / ChunkLoadError).
is_running() {
  sanitize_pid_files
  process_alive_from_pidfile && return 0
  service_responds && return 0
  return 1
}

should_use_https() {
  case "$(printf '%s' "${STREAM_USE_HTTPS:-0}" | tr '[:upper:]' '[:lower:]')" in
    0 | false | no | off) return 1 ;;
    *) return 0 ;;
  esac
}

bind_mode_or_http() {
  [ -f "$BIND_MODE_FILE" ] && cat "$BIND_MODE_FILE" 2>/dev/null || echo ""
}

wait_for_ready() {
  local i
  for i in $(seq 1 60); do
    if service_responds; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

wait_for_https_ready() {
  local i
  for i in $(seq 1 50); do
    if curl -kfsS "https://127.0.0.1:${HTTPS_PORT}/" -o /dev/null -m 2 2>/dev/null; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

open_browser() {
  local open_url="$URL"
  if [ "$(bind_mode_or_http)" = "lan-https" ]; then
    open_url="https://localhost:${HTTPS_PORT}"
  fi
  if have open; then
    open "$open_url"
  elif have xdg-open; then
    xdg-open "$open_url"
  fi
}

ensure_built() {
  if [ ! -d ".next" ]; then
    echo "→ First-time build…"
    "$NPM_BIN" run build || return 1
  fi
}

# Returns 0 when we should run next start on 0.0.0.0 (phones/TVs on same LAN).
should_bind_lan() {
  case "$(printf '%s' "${STREAM_BIND_LAN}" | tr '[:upper:]' '[:lower:]')" in
    0 | false | no | off | local | localhost) return 1 ;;
    *) return 0 ;;
  esac
}

collect_lan_ips() {
  local iface ip
  for iface in en0 en1 en2 en3 en4 en5; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [ -n "$ip" ]; then
      printf '%s\n' "$ip"
    fi
  done | sort -u
}

print_lan_urls() {
  should_bind_lan || return 0
  local ip any=0
  local mode
  mode="$(bind_mode_or_http)"
  echo ""
  echo "Other devices on your Wi‑Fi — use HTTPS if Safari shows “HTTPS Only” / blocks HTTP:"
  while IFS= read -r ip; do
    [ -z "$ip" ] && continue
    if [ "$mode" = "lan-https" ]; then
      echo "  https://${ip}:${HTTPS_PORT}   ← use this on iPhone (certificate warning is normal on first visit)"
      echo "  http://${ip}:${PORT}          ← plain HTTP if your browser allows it"
    else
      echo "  http://${ip}:${PORT}"
    fi
    any=1
  done < <(collect_lan_ips)
  if [ "$any" = "0" ]; then
    echo "  (No LAN IP found — check System Settings → Network, or run on Wi‑Fi.)"
  fi
  echo ""
  echo "This Mac: ${URL}"
  if [ "$mode" = "lan-https" ]; then
    echo "This Mac (HTTPS): https://localhost:${HTTPS_PORT}"
  fi
  echo "Listen on this Mac only next time: npm run app:start:local"
  echo ""
  echo "Can't reach from a phone/TV? Same Wi‑Fi, then check:"
  if [ "$mode" = "lan-https" ]; then
    echo "  System Settings → Network → Firewall — allow incoming for Node.js (ports ${PORT} & ${HTTPS_PORT})."
  else
    echo "  System Settings → Network → Firewall — allow incoming for Node.js (or port ${PORT})."
  fi
}

# ---- commands --------------------------------------------------------------
cmd_install() {
  ensure_node
  if [ ! -d "node_modules" ]; then
    echo "→ Installing dependencies…"
    "$NPM_BIN" install
  fi
  echo "→ Building production bundle…"
  "$NPM_BIN" run build
  echo "✓ Ready. Run 'npm run app:start' — listens on your LAN by default for phones/TVs."
  echo "  Localhost only: npm run app:start:local"
}

cmd_start() {
  ensure_node

  sanitize_pid_files
  if is_running; then
    recover_next_pid_if_needed || true
    echo "✓ Already running at $URL"
    if [ -f "$BIND_MODE_FILE" ]; then
      case "$(cat "$BIND_MODE_FILE" 2>/dev/null)" in
        lan | lan-https) print_lan_urls ;;
      esac
    fi
    open_browser
    return 0
  fi

  # Dead Next/proxy on the port → ChunkLoadError / unstyled HTML after closing Terminal or partial shutdown.
  clear_stream_listener_on_port "$PORT" "HTTP"
  if should_bind_lan && should_use_https; then
    clear_stream_listener_on_port "$HTTPS_PORT" "HTTPS"
  fi

  if [ ! -d "node_modules" ]; then
    echo "→ Installing dependencies (one-time)…"
    "$NPM_BIN" install || { echo "npm install failed."; exit 1; }
  fi
  ensure_built || { echo "Build failed."; exit 1; }

  if [ -z "${STREAM_SESSION_SECRET:-}" ]; then
    echo "⚠ STREAM_SESSION_SECRET is not set — login / TV pairing will fail until you add it (see .env.example). Generate a long random string (32+ chars)." >&2
  fi

  NEXT_CLI="$(next_executable)"
  if [ ! -x "$NEXT_CLI" ]; then
    echo "Error: Next.js binary missing at $NEXT_CLI — run npm install." >&2
    exit 1
  fi

  local bind_host="127.0.0.1"
  if should_bind_lan; then
    bind_host="0.0.0.0"
    echo "→ Starting Stream (LAN — reachable from phones & TVs on this network)"
  else
    echo "local" > "$BIND_MODE_FILE"
    echo "→ Starting Stream (localhost only — not reachable from other devices)"
  fi

  echo "→ Local URL: $URL"
  : > "$LOG_FILE"
  # nohup + detached stdin: survives Terminal.app closing (SIGHUP); npm wrapper subshell did not.
  NODE_ENV=production nohup "$NEXT_CLI" start -p "$PORT" -H "$bind_host" >>"$LOG_FILE" 2>&1 </dev/null &
  echo $! >"$PID_FILE"

  if wait_for_ready; then
    HTTPS_FRONT_JS="$PROJECT_DIR/scripts/https-proxy-front.cjs"
    if should_bind_lan && should_use_https; then
      if [ -f "$HTTPS_FRONT_JS" ] && [ -x "$NODE_BIN" ]; then
        rm -f "$HTTPS_PID_FILE"
        nohup env PORT="$PORT" HTTPS_PORT="$HTTPS_PORT" "$NODE_BIN" "$HTTPS_FRONT_JS" >>"$LOG_FILE" 2>&1 </dev/null &
        echo $! >"$HTTPS_PID_FILE"
        if wait_for_https_ready; then
          echo "lan-https" >"$BIND_MODE_FILE"
          echo "→ HTTPS front for LAN: *:${HTTPS_PORT} (TLS) → http://127.0.0.1:${PORT} (Next.js)"
        else
          echo "⚠ HTTPS proxy failed to respond; stopping TLS front. Use http:// on port ${PORT} or check logs." >&2
          local hp
          hp="$(tr -d '[:space:]' <"$HTTPS_PID_FILE" 2>/dev/null || true)"
          [ -n "$hp" ] && kill "$hp" 2>/dev/null || true
          sleep 0.2
          [ -n "$hp" ] && kill -9 "$hp" 2>/dev/null || true
          clear_tcp_listeners "$HTTPS_PORT" "HTTPS"
          rm -f "$HTTPS_PID_FILE"
          echo "lan" >"$BIND_MODE_FILE"
        fi
      else
        echo "⚠ Could not start HTTPS proxy (need Node and $HTTPS_FRONT_JS). LAN will use HTTP only." >&2
        echo "lan" >"$BIND_MODE_FILE"
      fi
    elif should_bind_lan; then
      echo "lan" >"$BIND_MODE_FILE"
    fi

    echo "✓ Running. Opening ${URL} …"
    print_lan_urls
    open_browser
  else
    echo "✗ Server didn't become ready in ~30s. Recent logs:" >&2
    tail -n 40 "$LOG_FILE" >&2
    exit 1
  fi
}

cmd_stop() {
  local stopped=0
  if [ -s "$HTTPS_PID_FILE" ]; then
    local hp
    hp=$(cat "$HTTPS_PID_FILE")
    if [ -n "$hp" ] && kill -0 "$hp" 2>/dev/null; then
      kill "$hp" 2>/dev/null || true
      sleep 0.2
      kill -9 "$hp" 2>/dev/null || true
      stopped=1
    fi
    rm -f "$HTTPS_PID_FILE"
  fi
  local hpids
  hpids=$(lsof -ti tcp:"$HTTPS_PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$hpids" ]; then
    echo "$hpids" | xargs kill -9 2>/dev/null || true
    stopped=1
  fi

  if [ -s "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 0.3
      kill -9 "$pid" 2>/dev/null || true
      stopped=1
    fi
    rm -f "$PID_FILE"
  fi
  # Belt and braces: kill anything else on the port.
  local pids
  pids=$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    stopped=1
  fi
  if [ "$stopped" = "1" ]; then
    echo "✓ Stopped."
  else
    echo "Not running."
  fi
}

cmd_status() {
  sanitize_pid_files
  recover_next_pid_if_needed || true
  if is_running; then
    echo "✓ Running at $URL  (pid: $(cat "$PID_FILE" 2>/dev/null || echo '?'))"
    if [ -f "$BIND_MODE_FILE" ]; then
      local bm
      bm="$(cat "$BIND_MODE_FILE" 2>/dev/null)"
      if [ "$bm" = "lan" ] || [ "$bm" = "lan-https" ]; then
        echo "  Reachable on LAN:"
        local ip any=0
        while IFS= read -r ip; do
          [ -z "$ip" ] && continue
          if [ "$bm" = "lan-https" ]; then
            echo "    https://${ip}:${HTTPS_PORT}"
            echo "    http://${ip}:${PORT}"
          else
            echo "    http://${ip}:${PORT}"
          fi
          any=1
        done < <(collect_lan_ips)
        [ "$any" = "0" ] && echo "    (no LAN IP detected)"
      fi
    fi
  else
    echo "Stopped."
  fi
}

cmd_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    echo "No logs yet."
    return 0
  fi
  if [ "${1:-}" = "-f" ]; then
    tail -f "$LOG_FILE"
  else
    tail -n 200 "$LOG_FILE"
  fi
}

cmd_autostart() {
  ensure_node
  case "${1:-enable}" in
    enable)
      mkdir -p "$(dirname "$LAUNCHD_PLIST")"
      cat > "$LAUNCHD_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>${SCRIPT_DIR}/run.sh</string>
      <string>start</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
      <key>PORT</key>
      <string>${PORT}</string>
      <key>HTTPS_PORT</key>
      <string>${HTTPS_PORT}</string>
      <key>STREAM_BIND_LAN</key>
      <string>${STREAM_BIND_LAN}</string>
      <key>STREAM_USE_HTTPS</key>
      <string>${STREAM_USE_HTTPS}</string>
      <key>PATH</key>
      <string>$(dirname "$NODE_BIN"):/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key>
      <false/>
      <key>NetworkState</key>
      <true/>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${LOG_FILE}</string>
  </dict>
</plist>
PLIST
      launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
      launchctl load -w "$LAUNCHD_PLIST"
      echo "✓ Auto-start enabled. Stream will run on login at $URL."
      ;;
    disable)
      if [ -f "$LAUNCHD_PLIST" ]; then
        launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
        rm -f "$LAUNCHD_PLIST"
        echo "✓ Auto-start disabled."
      else
        echo "Auto-start was not enabled."
      fi
      ;;
    *)
      echo "Usage: $0 autostart [enable|disable]"
      exit 2
      ;;
  esac
}

cmd_help() {
  cat <<EOF
Stream — IPTV Player

Usage: $0 <command>

Commands:
  install            Install dependencies & build the production bundle.
  start              Start the server in the background and open the browser.
  stop               Stop the running server.
  status             Show whether the server is running.
  logs [-f]          Print recent logs (-f to follow).
  autostart enable   Run Stream automatically on login.
  autostart disable  Remove the autostart entry.

Environment:
  STREAM_BIND_LAN    Default 1: bind 0.0.0.0 so phones/TVs on your Wi‑Fi can connect.
                     Set to 0 for localhost-only (not reachable from other devices).
  STREAM_USE_HTTPS   Default 1 when LAN is on: TLS proxy on HTTPS_PORT (3443) so iOS Safari
                     “HTTPS Only” can open the app. Set to 0 for HTTP-only LAN.
  HTTPS_PORT         TLS listen port when STREAM_USE_HTTPS=1 (default 3443).

Url: $URL
Logs: $LOG_FILE
EOF
}

case "${1:-help}" in
  install) shift; cmd_install "$@" ;;
  start)   shift; cmd_start "$@"   ;;
  stop)    shift; cmd_stop "$@"    ;;
  status)  shift; cmd_status "$@"  ;;
  logs)    shift; cmd_logs "$@"    ;;
  autostart) shift; cmd_autostart "$@" ;;
  help|-h|--help) cmd_help ;;
  *) cmd_help; exit 2 ;;
esac
