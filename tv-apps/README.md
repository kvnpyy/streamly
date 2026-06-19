# Streamly TV app wrappers

Thin store packages that load the Streamly web app in a fullscreen browser shell. Same codebase as the website — no separate native player to maintain.

## Before you submit

1. Set the production URL in each platform config (replace `https://iptvwebplayer.org`).
2. Self-hosters: use your own HTTPS origin (required by Samsung/LG/Amazon).
3. Prepare store assets: 512×512 icon, 1920×1080 screenshots from a real TV.
4. Privacy policy URL: `https://iptvwebplayer.org/legal/privacy` (or your instance).
5. Position the listing as a **media player** — users bring their own IPTV subscription.

## Platforms

| Folder | Store | Package |
|--------|-------|---------|
| `tizen/` | Samsung Seller Office | `.wgt` |
| `webos/` | LG Seller Lounge | `.ipk` |
| `firetv/` | Amazon Appstore (Web App) | hosted URL |

## User onboarding

Point users to **/tv** on your instance for QR codes, PIN pairing steps, and per-platform instructions.

## PIN pairing (multi-instance)

TV PIN codes are stored in SQLite (`tv_pair_codes`). All app server processes must share the same `DATABASE_URL` file for pairing to work across restarts and replicas.
