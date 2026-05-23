# Streamly — Self-Hosted IPTV Player

> A fast, modern web IPTV player for your own Xtream Codes subscription.
> Self-host it on a VPS, a home server, or just run it locally on your Mac/PC.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is this?

Streamly is a full-featured IPTV front-end that works with any **Xtream Codes**-compatible IPTV provider. You bring your own subscription; Streamly is the player.

It lives in a browser tab but feels closer to a streaming app — Netflix-style shelves, a
custom HLS player, TV remote navigation, EPG guide, parental controls, and more.

**No ads. No tracking by default. Fully open source.**

---

## Features

| | |
|---|---|
| 📺 **Live TV** | Channels grouped by category, EPG guide, region filter |
| 🎬 **Movies** | Poster grid, ratings, plot, cast, sortable & searchable |
| 🍿 **Series** | Full seasons & episodes with artwork and auto-resume |
| 🔍 **Global search** | Channels, movies, and series — `⌘K` to open |
| ❤️ **Favorites & Continue Watching** | Persisted locally per account |
| 📡 **Three-tier EPG** | Provider → provider full-schedule → iptv-org public XMLTV fallback |
| 🎥 **Custom HLS player** | Quality selector, PiP, fullscreen, keyboard & TV remote shortcuts |
| 📱 **Responsive** | iPhone/iPad, desktop, and Samsung/LG TV browsers |
| 🛰️ **Built-in proxy** | Solves CORS, mixed-content, and HLS manifest rewriting |
| 🛡️ **Parental controls** | Hide adult categories with optional PIN |
| 🎨 **Dark, modern UI** | 2026 glassmorphism, soft gradients, skeleton loaders |

---

## Screenshots

<!-- TODO: add screenshots/demo GIF -->

---

## Self-hosting — quick start

### Option A: run locally (Mac / Linux / Windows WSL)

```bash
git clone https://github.com/kevinpayoyo96-dot/streamly.git
cd streamly
npm install
cp .env.example .env        # fill in AUTH_SECRET and STREAM_SESSION_SECRET at minimum
npm run dev                 # http://localhost:3000
```

Open `http://localhost:3000`, enter your Xtream Codes credentials, and start watching.

### Option B: production build (VPS / home server)

```bash
npm install
cp .env.example .env        # edit .env — see Environment section below
npm run build
npm start                   # or: pm2 start npm -- start
```

Then put Nginx or Cloudflare in front for HTTPS.

A ready-made **systemd service** is in `scripts/systemd/stream.service`.  
A scripted Ubuntu bootstrap (installs Node, sets up the service, etc.) is in
`scripts/vps-bootstrap.sh`.

### Option C: Docker

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

> Enable `output: 'standalone'` in `next.config.ts` for the standalone copy.

---

## Environment variables

Copy `.env.example` and fill in at minimum:

| Variable | Required | Description |
|---|---|---|
| `AUTH_SECRET` | ✅ | NextAuth session signing key (`openssl rand -base64 32`) |
| `STREAM_SESSION_SECRET` | ✅ | Encrypts HttpOnly IPTV session cookies (32+ chars) |
| `DATABASE_URL` | — | SQLite path (default: `file:./data/stream.db`) |
| `RESEND_API_KEY` | production | Email for sign-up verification & password reset |
| `EMAIL_FROM` | production | Sender address Resend accepts |
| `TMDB_API_TOKEN` | optional | [TMDB](https://www.themoviedb.org/settings/api) free read token — enables artwork on channel cards |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | optional | GA4 measurement ID — leave unset to disable analytics |

See `.env.example` for the full list with comments.

---

## Architecture

```
src/
  app/
    api/
      xtream/        Xtream Codes JSON proxy
      stream/        HLS + VOD media proxy (manifest rewriting + Range)
      img/           Poster/logo proxy with caching
      external-epg/  Public XMLTV fallback (epg.pw / iptv-org)
      artwork/       TMDB artwork proxy (server-side cached)
    app/             Authenticated shell
      live/          Live TV (Netflix-style shelves + list + EPG guide)
      movies/        Movies grid + detail
      series/        Series grid + seasons/episodes detail
      favorites/     Saved items
      search/        Global search
      settings/      Account + data management
    login/           Login / register
  components/
    Player.tsx       Custom HLS-aware video player overlay
    TvLiveBrowse     TV browser shelf layout with spatial D-pad navigation
    WebLiveBrowse    Web/mobile shelf layout
    MediaCard        Poster card with initials fallback
    LiveChannelTile  Live channel row with EPG
    TvCategoryView   Full-screen "See all" overlay for TV
  lib/
    xtream.ts        Typed Xtream Codes API client
    hooks.ts         useChannelEPG — three-tier EPG chain
    channel-meta.ts  Heuristic channel name → country/network/flag parser
    external-epg.ts  Server-side iptv-org XMLTV download + fuzzy matcher
    epg-local-cache  localStorage-backed EPG cache (30 min TTL)
  store/
    auth.ts          Credentials + account (Zustand, persisted)
    preferences.ts   Favorites, recents, parental lock (Zustand, persisted)
    player.ts        Player overlay state
```

**Stack:** Next.js 16 · React 19 · Tailwind CSS v4 · HLS.js · Zustand · TanStack Query · Drizzle ORM · SQLite · Framer Motion

---

## EPG (Electronic Program Guide)

Live channels get "now playing" data from a three-tier fallback chain:

1. **Provider short EPG** — `get_short_epg` from your Xtream panel
2. **Provider full schedule** — `get_simple_data_table` (catches panels that omit `epg_channel_id`)
3. **Public XMLTV fallback** — [epg.pw](https://epg.pw/) (iptv-org data) when the provider has no data and the channel name implies a country code

Results are cached in localStorage for 30 minutes so subsequent page opens are instant.

---

## Keyboard shortcuts

| Action | Key |
|---|---|
| Open search | `⌘K` / `Ctrl+K` |
| Play / pause | `Space` or `K` |
| Seek ±10 s | `←` `→` |
| Flip channel (Live TV) | `↑` `↓` |
| Mute | `M` |
| Fullscreen | `F` |
| Picture-in-picture | `P` |
| Close player | `Esc` / Back button |

---

## TV browser support

Streamly has a dedicated TV layout (detected automatically) optimised for:
- Samsung Internet (Tizen)
- LG webOS browser
- Amazon Fire TV Silk browser

Features: spatial D-pad navigation, large touch targets, hardware Back button exits fullscreen/player, region-filtered shelves.

---

## Contributing

PRs and issues welcome. Run `npm run dev` to get started. Please run
`npm run predeploy` (lint + build) before opening a PR.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Disclaimer

Streamly is a player. It does not provide, host, or distribute any IPTV content.
You are responsible for using it only with content you have the right to access.
