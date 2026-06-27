#!/usr/bin/env bash
# Collect host + app metrics into data/monitor/ (run every 5 min via cron).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
MONITOR_DIR="$APP_DIR/data/monitor"
STATE_FILE="$MONITOR_DIR/.net-state"
SAMPLES_FILE="$MONITOR_DIR/samples.jsonl"
LATEST_FILE="$MONITOR_DIR/latest.json"
MAX_SAMPLES="${CAPACITY_MAX_SAMPLES:-3024}"

mkdir -p "$MONITOR_DIR"

read_mem() {
  local total avail used pct
  total=$(awk '/^MemTotal:/ {print int($2/1024)}' /proc/meminfo)
  avail=$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo)
  used=$((total - avail))
  pct=0
  if [ "$total" -gt 0 ]; then
    pct=$((used * 100 / total))
  fi
  echo "$total $used $pct"
}

read_swap_mb() {
  awk '/^SwapTotal:/ {t=$2} /^SwapFree:/ {f=$2} END { if (t>0) print int((t-f)/1024); else print 0 }' /proc/meminfo
}

read_cpu_pct() {
  local idle0 idle1 total0 total1
  read -r _ user nice system idle iowait irq softirq steal _ < /proc/stat
  idle0=$((idle + iowait))
  total0=$((user + nice + system + idle + iowait + irq + softirq + steal))
  sleep 1
  read -r _ user nice system idle iowait irq softirq steal _ < /proc/stat
  idle1=$((idle + iowait))
  total1=$((user + nice + system + idle + iowait + irq + softirq + steal))
  local dt idle_dt
  dt=$((total1 - total0))
  idle_dt=$((idle1 - idle0))
  if [ "$dt" -le 0 ]; then
    echo 0
  else
    echo $(( (dt - idle_dt) * 100 / dt ))
  fi
}

pick_iface() {
  awk -F'[: ]+' '
    $1 ~ /^(lo|docker|veth|br-|tailscale)/ { next }
    $3 > 0 { print $1; exit }
  ' /proc/net/dev
}

read_net() {
  local iface rx tx
  iface="$(pick_iface)"
  if [ -z "$iface" ]; then
    echo "0 0 0"
    return
  fi
  read -r rx tx < <(awk -v iface="$iface" -F'[: ]+' '
    $1 == iface { print $2, $10 }
  ' /proc/net/dev)
  echo "$iface $rx $tx"
}

calc_egress_mbps() {
  local iface="$1" tx="$2" now
  now=$(date +%s)
  if [ -f "$STATE_FILE" ]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
    if [ "${prev_iface:-}" = "$iface" ] && [ -n "${prev_tx:-}" ] && [ -n "${prev_ts:-}" ]; then
      local dt dtx
      dt=$((now - prev_ts))
      dtx=$((tx - prev_tx))
      if [ "$dt" -gt 0 ] && [ "$dtx" -ge 0 ]; then
        awk -v bytes="$dtx" -v sec="$dt" 'BEGIN { printf "%.2f", (bytes * 8) / (sec * 1000000) }'
        echo "iface=$iface" >"$STATE_FILE"
        echo "prev_tx=$tx" >>"$STATE_FILE"
        echo "prev_ts=$now" >>"$STATE_FILE"
        return
      fi
    fi
  fi
  echo "iface=$iface" >"$STATE_FILE"
  echo "prev_tx=$tx" >>"$STATE_FILE"
  echo "prev_ts=$now" >>"$STATE_FILE"
  echo "0"
}

read_disk() {
  df -P "$APP_DIR" | awk 'NR==2 {
    gsub("%","",$5);
  print $3/1024/1024, $2/1024/1024, $5
  }'
}

node_rss_mb() {
  local pid
  pid=$(systemctl show stream -p MainPID --value 2>/dev/null || true)
  if [ -z "$pid" ] || [ "$pid" = "0" ]; then
    pid=$(pgrep -f "node.*server.js" 2>/dev/null | head -1 || true)
  fi
  if [ -n "$pid" ] && [ -r "/proc/$pid/status" ]; then
    awk '/^VmRSS:/ {print int($2/1024)}' "/proc/$pid/status"
  else
    echo 0
  fi
}

stream_active=0
stream_rpm=0
if [ -f "$APP_DIR/.env" ]; then
  CAPACITY_METRICS_SECRET="$(grep -E '^CAPACITY_METRICS_SECRET=' "$APP_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  export CAPACITY_METRICS_SECRET
fi
if [ -n "${CAPACITY_METRICS_SECRET:-}" ]; then
  metrics_json=$(curl -fsS -m 5 -H "Authorization: Bearer ${CAPACITY_METRICS_SECRET}" \
    "http://127.0.0.1:3000/api/metrics?token=${CAPACITY_METRICS_SECRET}" 2>/dev/null || true)
  if [ -n "$metrics_json" ]; then
    stream_active=$(printf '%s' "$metrics_json" | node -e '
      let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{
        try { const j=JSON.parse(d); console.log(j.app?.streamProxy?.active ?? 0); }
        catch { console.log(0); }
      });
    ')
    stream_rpm=$(printf '%s' "$metrics_json" | node -e '
      let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{
        try { const j=JSON.parse(d); console.log(j.app?.streamProxy?.rpmP95 ?? 0); }
        catch { console.log(0); }
      });
    ')
  fi
fi

read -r mem_total_mb mem_used_mb ram_used_pct < <(read_mem)
swap_used_mb=$(read_swap_mb)
cpu_pct=$(read_cpu_pct)
read -r disk_used_gb disk_total_gb disk_used_pct < <(read_disk)
read -r net_iface net_rx net_tx < <(read_net)
egress_mbps=$(calc_egress_mbps "$net_iface" "$net_tx")
load1=$(awk '{print $1}' /proc/loadavg)
node_rss=$(node_rss_mb)
service_active=false
if systemctl is-active --quiet stream 2>/dev/null; then
  service_active=true
fi

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

sample=$(node -e '
const o = {
  ts: process.argv[1],
  ramUsedPct: Number(process.argv[2]),
  memUsedMb: Number(process.argv[3]),
  memTotalMb: Number(process.argv[4]),
  swapUsedMb: Number(process.argv[5]),
  cpuPct: Number(process.argv[6]),
  diskUsedPct: Number(process.argv[7]),
  diskUsedGb: Number(process.argv[8]),
  diskTotalGb: Number(process.argv[9]),
  egressMbps: Number(process.argv[10]),
  netTxBytes: Number(process.argv[11]),
  netRxBytes: Number(process.argv[12]),
  streamActive: Number(process.argv[13]),
  streamRpm: Number(process.argv[14]),
  nodeRssMb: Number(process.argv[15]),
  load1: Number(process.argv[16]),
};
console.log(JSON.stringify(o));
' "$ts" "$ram_used_pct" "$mem_used_mb" "$mem_total_mb" "$swap_used_mb" \
  "$cpu_pct" "$disk_used_pct" "$disk_used_gb" "$disk_total_gb" \
  "$egress_mbps" "$net_tx" "$net_rx" "$stream_active" "$stream_rpm" \
  "$node_rss" "$load1")

printf '%s\n' "$sample" >>"$SAMPLES_FILE"

if [ -f "$SAMPLES_FILE" ]; then
  lines=$(wc -l <"$SAMPLES_FILE" | tr -d ' ')
  if [ "$lines" -gt "$MAX_SAMPLES" ]; then
    tail -n "$MAX_SAMPLES" "$SAMPLES_FILE" >"$SAMPLES_FILE.tmp"
    mv "$SAMPLES_FILE.tmp" "$SAMPLES_FILE"
  fi
fi

latest=$(node -e '
const sample = JSON.parse(process.argv[1]);
const latest = {
  ts: sample.ts,
  ram: { totalMb: sample.memTotalMb, usedMb: sample.memUsedMb, usedPct: sample.ramUsedPct },
  swap: { usedMb: sample.swapUsedMb },
  cpu: { pct: sample.cpuPct, load1: sample.load1 },
  disk: { usedPct: sample.diskUsedPct, usedGb: sample.diskUsedGb, totalGb: sample.diskTotalGb },
  network: { iface: process.argv[2], egressMbps: sample.egressMbps, txBytes: sample.netTxBytes, rxBytes: sample.netRxBytes },
  stream: { serviceActive: process.argv[3] === "true", active: sample.streamActive, rpmP95: sample.streamRpm },
  nodeRssMb: sample.nodeRssMb,
};
console.log(JSON.stringify(latest, null, 2));
' "$sample" "$net_iface" "$service_active")

printf '%s\n' "$latest" >"$LATEST_FILE"
