# VPS hosting checklist (Streamly / iptv-player)

Use this after bootstrap or when auditing production. Apply automated tuning:

```bash
# From laptop (rsync tuning files is done by deploy; or pipe script):
cd iptv-player
rsync -az scripts/vps-tuning scripts/vps-apply-tuning.sh ubuntu@YOUR_VPS:/tmp/streamly-tuning/
ssh ubuntu@YOUR_VPS 'sudo bash /tmp/streamly-tuning/vps-apply-tuning.sh'
```

## What “good” looks like

| Area | Target |
|------|--------|
| App bind | `127.0.0.1:3000` only (not public) |
| TLS | Caddy on 80/443, **Cloudflare** in front |
| Firewall | UFW: deny incoming except 22, 80, 443 |
| SSH | `PasswordAuthentication no`, keys only |
| Process | `stream` user, `systemd` `stream.service`, `Restart=on-failure` |
| Memory | `MemoryMax` on unit; Node `--max-old-space-size` |
| Swap | 2G swap file on 8G VPS (OOM safety during `next build`) |
| DB | SQLite + daily `npm run db:backup` cron as `stream` |
| Updates | `unattended-upgrades` enabled |
| Brute force | `fail2ban` sshd jail + UFW |

## VOD source cache (series / MKV)

When `STREAM_VOD_TRANSCODE=1`, the app **downloads** the episode to disk (`STREAM_VOD_SOURCE_DIR`, default `/var/lib/streamly/vod-source` or `.cache/vod-source`) and runs ffmpeg against that local file. This avoids mid-episode stalls when the provider HTTP connection drops mid-encode. Single-connection IPTV panels get one download at a time (not download + live HTTP ffmpeg).

- Disk: HLS segments under `STREAM_TRANSCODE_CACHE_DIR` **plus** source files under `STREAM_VOD_SOURCE_DIR`. Idle TTL reclaims both; cap with `STREAM_VOD_SOURCE_MAX_BYTES`.
- Emergency rollback: `STREAM_VOD_SOURCE_CACHE=0` (ffmpeg reads the provider URL again).

## Cloudflare (DNS proxy ON)

Do in the Cloudflare dashboard — not on the VPS:

1. **SSL/TLS** → Full (strict) if origin has valid cert (Caddy auto-HTTPS).
2. **Caching** → Cache static `/_next/static/*` aggressively; bypass cache for `/api/*` and authenticated `/app/*`.
3. **Security** → Bot Fight / rate limiting on `/api/auth/*` and `/api/xtream`.
4. **Origin** → Optional: firewall rule to allow only Cloudflare IPs to 80/443 (advanced).

## Cron (user `stream`)

See `scripts/crontab.example`. Verify:

```bash
sudo -u stream crontab -l
tail /opt/stream/iptv-player/data/backup-cron.log
```

Remove duplicate backup lines if both `0 4` and `15 3` run `db:backup`.

## Node upgrades

Node comes from NodeSource. After `apt upgrade` shows `nodejs` pending, restart during low traffic:

```bash
sudo apt install -y nodejs
sudo systemctl restart stream
```

## Monitoring

- Uptime: `GET https://iptvwebplayer.org/api/health`
- Sentry: `NEXT_PUBLIC_SENTRY_DSN` in `.env`
- Logs: `journalctl -u stream -f`, `journalctl -u caddy -f`

## Do not

- Expose port 3000 on UFW.
- Run the app as root.
- Commit `.env` or open SQLite to the internet.
- Set `AUTH_RATE_LIMIT_DISABLED=1` in production.
