# Deploying Streamly (iptv-player)

One-button **local gate** before you tag or ship:

```bash
npm run predeploy
```

Runs `eslint` → `vitest` → `next build`. CI should run the same steps on every PR.

## Environment

Copy `.env.example` to `.env` on the host and set at minimum:

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | NextAuth JWT signing (≥16 chars) |
| `STREAM_SESSION_SECRET` | Encrypted IPTV HttpOnly cookie + optional providercrypto |
| `DATABASE_URL` | SQLite path (default `file:./data/stream.db`) |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key — **required in production** for signup, email verification, and password reset. |
| `EMAIL_FROM` | Sender Resend accepts. **On systemd, use double quotes if the value contains spaces or `<` `>`**, e.g. `EMAIL_FROM="Streamly <noreply@yourdomain.com>"` in `/opt/stream/iptv-player/.env`. |
| `EMAIL_REPLY_TO` | Optional. If set, `Reply-To` header points here (e.g. `support@…`) so the message is not a “black hole” noreply — small deliverability / trust win. |
| `RESEND_MARKETING_SEGMENT_ID` | Optional. Resend **Segment** id — verified users who opt in are synced to Resend Contacts on verification. Your source of truth remains SQLite (`users.marketing_opt_in`, etc.). |

Optional: `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL`, `NEXT_PUBLIC_LEGAL_PROVINCE` (Canadian province for governing-law copy on `/legal/*`).  
`NEXT_PUBLIC_SITE_URL` — canonical / OG / sitemap (defaults to `https://iptvwebplayer.org` in app config if unset).  
`NEXT_PUBLIC_SHOW_COOKIE_CONSENT=1` — EU-style banner; when set, **Google Analytics only loads after “Accept all”**.  
`NEXT_PUBLIC_GA_MEASUREMENT_ID` — GA4 id; set empty to disable analytics locally.  
`AUTH_RATE_LIMIT_DISABLED=1` — disables per-IP limits on register / verify / resend / forgot / reset (local debugging only).  
`AUTH_RATE_WINDOW_MS` / `AUTH_RATE_MAX_PER_WINDOW` — tune the default auth rate limiter (see `src/lib/auth-rate-limit.ts`).

### Email verification and existing users

New accounts must **confirm email** before signing in. After deploying a build that adds `email_verified_at` and `auth_tokens`, run **`npm run db:push`** on the host so SQLite gets the new columns/table.

If you already have rows in `users` from before verification existed, **one-time** mark them verified so they are not locked out (run on the VPS as the app user, path from your install):

```bash
sqlite3 /opt/stream/iptv-player/data/stream.db "UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;"
```

### Marketing opt-in (product updates)

After deploy, run **`npm run db:push`** so `users` gets `marketing_opt_in`, `marketing_unsubscribed_at`, and related columns. **Do not** bulk opt-in existing users — they must check the box at signup or in Settings.

Export opted-in verified users (for a manual Resend import or audit):

```bash
sqlite3 /opt/stream/iptv-player/data/stream.db \
  "SELECT email, name, datetime(email_verified_at/1000,'unixepoch') FROM users WHERE marketing_opt_in = 1 AND email_verified_at IS NOT NULL AND marketing_unsubscribed_at IS NULL;"
```

Resend **Contacts** (not the transactional “Emails” log) is populated when users verify with opt-in, or when they toggle product updates in Settings. Optional `RESEND_MARKETING_SEGMENT_ID` adds them to a Segment for broadcasts.

(Adjust the DB path to match `DATABASE_URL`.) New signups after deploy still receive a confirmation link.

### Email deliverability (fewer “Promotions” / junk)

1. In **Resend → Domains**, open your domain and confirm **every** DNS record they show is **green** (SPF, DKIM; add **DMARC** at `_dmarc.yourdomain` when you are ready — start with `p=none` if unsure).
2. Use a **simple `EMAIL_FROM`** on that verified domain (e.g. `noreply@yourdomain.com`). Match the **public site** domain in links (`NEXT_PUBLIC_SITE_URL`).
3. Optional: set **`EMAIL_REPLY_TO`** to a real monitored address (see env table) — we send it as the `Reply-To` header.
4. Register the domain in **[Google Postmaster Tools](https://postmaster.google.com/)** (free) after you send real mail; it shows reputation over time.
5. **New domains** often land in junk for the first messages; ask early users to **“Not spam”** once — engagement helps filters learn.

## Database backups

SQLite is a single file — copy it on a schedule:

```bash
npm run db:backup
```

**Automate on the VPS:** run `npm run db:backup` as the app user on a schedule. Example lines live in **`scripts/crontab.example`** (`crontab -e` → paste/adjust paths). Keep copies **off the app disk** when possible (rsync to object storage, another host, or Time Machine–style rotation).

### Verify your backup cron (5-minute check)

SSH into the VPS, then run **as the same Linux user that owns the app** (often `stream` — *not* root unless you really installed cron as root):

```bash
whoami
crontab -l
```

You should see your line with `npm run db:backup`. Check the **path**: `cd /opt/stream/iptv-player` must match where the app and `package.json` live on *your* server.

**Dry run (always works if the app user can read the DB file):**

```bash
cd /opt/stream/iptv-player
npm run db:backup
ls -lt data/*.bak.* | head
```

You should see a new `*.bak.YYYYMMDD-HHMMSS` file next to your SQLite file.

**Log file (if you used `scripts/crontab.example`):** after the first scheduled run, check:

```bash
tail -20 /opt/stream/iptv-player/data/backup-cron.log
```

If the log is empty and no `*.bak.*` appeared after the cron time, common issues are: wrong `cd` path, cron runs as a different user than you tested, or **`>> /var/log/...`** without permission (the example file uses **`data/backup-cron.log`** so the `stream` user can write it).

## Health check

`GET /api/health` returns `{ ok, database, time }` — use it for load balancer / uptime monitors (expect **503** if SQLite is unavailable).

## Capacity monitoring (upgrade signals)

Track whether your VPS is still appropriately sized (RAM, CPU, disk, bandwidth, concurrent streams).

**One-time on the VPS (as root):**

```bash
cd /opt/stream/iptv-player
sudo bash scripts/vps-monitoring-setup.sh /opt/stream/iptv-player
```

This adds `CAPACITY_METRICS_SECRET` to `.env`, creates `data/monitor/vps-spec.json` (edit to match your plan), installs a **5-minute cron** collector, and logrotate.

**Manual collect + report:**

```bash
cd /opt/stream/iptv-player
bash scripts/vps-monitor-collect.sh    # one sample now
npm run monitor:report                 # human-readable upgrade summary
npm run monitor:report -- --json       # paste into Cursor for a second opinion
```

**Protected API** (localhost only in normal setups):

```bash
curl -fsS -H "Authorization: Bearer $CAPACITY_METRICS_SECRET" \
  http://127.0.0.1:3000/api/metrics
```

Signals: `ok` → `watch` → `upgrade_soon` → `upgrade_now`. The report needs ~**48 samples** (~4 hours at 5 min intervals) before upgrade recommendations activate; until then it shows “collecting baseline.”

**Email alerts** (optional, uses existing Resend config):

```bash
# In /opt/stream/iptv-player/.env
CAPACITY_ALERT_EMAIL=you@example.com
```

Hourly cron (`npm run monitor:notify`) emails when the signal is **`upgrade_soon`** or **`upgrade_now`** (max once per 24h per level; escalations send immediately). Set `CAPACITY_ALERT_MIN_SIGNAL=watch` for earlier warnings, or `CAPACITY_ALERT_DISABLED=1` to turn off.

Test without sending: `npm run monitor:notify -- --dry-run`

Sentry (errors) and this stack (capacity) are complementary — Sentry won’t tell you when egress or RAM is trending high.

## Production process

Run Next in production mode (`next start` or your process manager). Put **Cloudflare** or another reverse proxy in front for TLS, caching static assets, and basic L3/L4 filtering if you want it — application logic stays in this Node process.

### Ubuntu VPS (e.g. OVH) — scripted path

From your laptop, copy the project to the server (example):

```bash
rsync -az --delete --exclude node_modules --exclude .next \
  ./iptv-player/ stream@YOUR_VPS_IP:/opt/stream/iptv-player/
```

On the VPS as **root** (first time only):

```bash
cd /opt/stream/iptv-player
bash scripts/vps-bootstrap.sh
```

Edit **`/opt/stream/iptv-player/.env`** as user `stream` (set `AUTH_SECRET`, `STREAM_SESSION_SECRET`, etc.), then:

```bash
cd /opt/stream/iptv-player
sudo bash scripts/vps-setup-app.sh /opt/stream/iptv-player
```

This runs `npm ci`, `db:push`, `predeploy`, installs **`stream.service`**, and starts the app on **127.0.0.1:3000**. Add Caddy/nginx + DNS when you have a domain.

### Playback smoke test (after player changes)

1. **Windows Chrome** — open a live channel; confirm video starts; channel up/down should feel responsive (debounced zaps).
2. **Try again** — first tap soft-reloads; second tap on the same channel does a full reset.
3. **Incognito** — if playback fails only with extensions enabled, the CSP/`eval` warning is usually a wallet extension, not Streamly.
4. **Reverse proxy** — avoid a strict `Content-Security-Policy` that blocks `blob:` workers unless you intentionally harden the site; the player runs hls.js on the main thread by default.

### Day-to-day: push code from your laptop to the VPS

The server does **not** auto-sync with your Mac. **Do not double‑click** `vps-push-deploy.sh` in Finder — macOS will open it in **Cursor/TextEdit** instead of running it. Use **Terminal** or the launcher below.

**One-time:** copy the example env file and set your SSH target:

```bash
cd /path/to/iptv-player
cp scripts/vps-deploy.env.example scripts/.vps-deploy.env
# Edit scripts/.vps-deploy.env → STREAM_DEPLOY_SSH=ubuntu@your.domain
```

**Each deploy** (runs `predeploy` locally, then rsync to a **staging directory** on the VPS, **`sudo rsync`** into `/opt/stream/iptv-player`, then remote `npm ci` + `build` + restart):

The app directory is normally **`stream`**-owned; your SSH user (e.g. `ubuntu`) cannot write there directly — the script avoids that. Server-only paths **`.env`** and **`data/`** are preserved across the merge.

```bash
cd /path/to/iptv-player
npm run deploy:vps
```

Faster when dependencies did not change:

```bash
npm run deploy:vps:quick
```

**Optional (Mac):** double‑click **`deploy-vps.command`** in Finder — it opens **Terminal.app**, loads `scripts/.vps-deploy.env`, and runs `npm run deploy:vps`. If macOS blocks it: right‑click → Open once.

**Manual** (no `.vps-deploy.env`): `STREAM_DEPLOY_SSH=ubuntu@host bash scripts/vps-push-deploy.sh` or add `--quick` after changing only app code.

**Alternative workflow:** push to GitHub, then on the VPS `git pull` as `stream`, `npm ci`, `npm run build`, `sudo systemctl restart stream` — good for teams; rsync is simpler for solo VPS use.

If you changed **database schema** (`src/db/schema` etc.), SSH in once and run:

```bash
sudo -u stream -H bash -lc 'cd /opt/stream/iptv-player && npm run db:push'
```

The deploy script does not run `db:push` every time to avoid accidental schema changes without you noticing.

**Windows PC:** use **Git Bash** or **WSL** for `npm run deploy:vps` (same scripts as macOS).

## Operations checklist (bandwidth + uptime)

Do this once per production cutover, then revisit quarterly.

| Step | Action |
|------|--------|
| 1 | **OVH Manager** — enable **email** notifications for billing, renewal, and (if available) quota / traffic. |
| 2 | Open **Network traffic** (or bandwidth graphs) for this VPS; add **calendar reminders** at ~**50%**, ~**80%**, and ~**100%** of your monthly transfer budget. |
| 3 | **External uptime monitor** — **not** Cloudflare-only; use e.g. [UptimeRobot](https://uptimerobot.com/) pinging `https://iptvwebplayer.org/api/health` (see **§ Uptime monitoring for beginners** below). |
| 4 | **Cloudflare (optional)** — **Analytics** to see how much traffic goes through the proxy (helps guess egress); this is **separate** from step 3. |
| 5 | **DB backups** — install cron from **`scripts/crontab.example`**; verify `*.bak.*` files appear under `data/`. |

Video egress (**`/api/stream`**) usually dominates cost; poster traffic (**`/api/img`**) is secondary but worth watching after scale. (OVH billing + traffic UI varies by offer — use Manager emails + graphs + your own reminders.)

## Uptime monitoring for beginners (OVH vs Cloudflare vs UptimeRobot)

**Three different things:**

| What | What it does | Do you need it? |
|------|----------------|-----------------|
| **OVH** | Bills you, hosts the VPS, may email you about **quota / bandwidth**. | You already have the server — turn on **email alerts** in OVH Manager (billing + traffic where available). This does **not** ping your website every minute. |
| **UptimeRobot** (or Pingdom, Better Stack, etc.) | A robot on the internet hits your URL every few minutes and emails you if **down** or slow. | **Yes, this is the “is my site up?” step.** Takes ~5 minutes to set up. |
| **Cloudflare** (if your domain uses it) | DNS + TLS + optional caching; **Analytics** shows **traffic volume** through Cloudflare. | Useful for **how busy** the site is; **not** a substitute for UptimeRobot unless you use Cloudflare’s separate uptime features (paid / more advanced). |

### Set up UptimeRobot (recommended “noob path”)

1. Go to [https://uptimerobot.com](https://uptimerobot.com) and create a free account.
2. **Add New Monitor** → type **HTTP(s)**.
3. **Friendly name:** e.g. `Streamly health`.
4. **URL:** `https://iptvwebplayer.org/api/health` (exact path — our app returns JSON `{ ok: true, ... }` when healthy).
5. **Monitoring interval:** 5 minutes is fine on the free tier.
6. Save. You should see **Up** within a minute if the site is reachable.
7. In UptimeRobot, add your **email** under **Alert contacts** so you get notified when it flips to **Down**.

**What “good” looks like:** status **Up**, and occasionally opening the URL in a browser shows JSON (you may need to be logged out of nothing — it’s a public health endpoint).

### Optional: peek at Cloudflare traffic

Only if your domain’s DNS is **orange-cloud** proxied through Cloudflare:

1. Log into [Cloudflare dashboard](https://dash.cloudflare.com) → select **iptvwebplayer.org**.
2. Open **Analytics & logs** (or **Traffic**) for the last 24h / 7d.
3. You’ll see request counts — useful with **OVH bandwidth graphs** to understand load. This is **not** the same as “alert me if the server is down” unless you add a separate monitor (UptimeRobot is simpler).

## CDN (images) — optional Cloudflare rule

The app responds to **`GET /api/img?u=…`** with **`Cache-Control: public, max-age=86400, stale-while-revalidate=604800`** on success (see `src/app/api/img/route.ts`). In Cloudflare (**Caching → Cache Rules**), you can match URI Path starting with **`/api/img`** and **respect origin cache control** (or standard caching). The cache key includes the **full query string** (`u=…`), so each poster is a separate cache entry.

**Caveats:** `/api/img` is effectively a **public** reverse proxy to arbitrary image URLs — only enable aggressive edge cache if that matches your threat model. If you add cookies to image requests later, use **`Vary`** or bypass CDN for that path.

## Rollbacks

**Automated (code deploy):** `scripts/vps-push-deploy.sh` takes a **filesystem snapshot** of the app directory before `rsync`, runs `npm ci` / `build` + `systemctl restart stream`, then **`curl`s** `STREAM_HEALTHCHECK_URL` (default **`http://127.0.0.1:3000/api/health`** on the VPS). If the check fails, it restores the snapshot and restarts the service. Set **`STREAM_DEPLOY_SKIP_HEALTHCHECK=1`** in `scripts/.vps-deploy.env` to skip (not recommended for production). This does **not** roll back SQLite — keep **`npm run db:backup`** on a schedule.

**Manual:** deploy from a known-good commit or tarball and restore a **database backup** if a migration or bug corrupted data.
