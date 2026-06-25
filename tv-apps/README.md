# Streamly TV app wrappers

Thin store packages that load the Streamly web app in a fullscreen browser shell. Same codebase as the website — no separate native player to maintain.

## Start here

**[STORE_SUBMISSION.md](./STORE_SUBMISSION.md)** — master checklist for Samsung, LG, Fire TV, and Android TV.

```bash
npm run tv:store:icons    # Pull icons from production
npm run tv:store:package  # Build unsigned .wgt + .ipk → tv-apps/dist/
```

## Before you submit

1. Production URL is set in `store-config.json` (default `https://iptvwebplayer.org`).
2. Run `npm run tv:store:icons` for 512×512 and platform-specific icon sizes.
3. Self-hosters: replace URLs with your own HTTPS origin (required by Samsung/LG/Amazon).
4. Prepare store assets: icons + 1920×1080 screenshots — see `assets/screenshots/README.md`.
5. Privacy policy: `https://iptvwebplayer.org/legal/privacy` (or your instance).
6. Position listings as a **media player** — users bring their own IPTV subscription.

## Platforms

| Folder | Store | Package |
|--------|-------|---------|
| `tizen/` | Samsung Seller Office | `.wgt` |
| `webos/` | LG Seller Lounge | `.ipk` |
| `firetv/` | Amazon Appstore (Web App) | hosted URL |
| `androidtv/` | Google Play (Android TV) | TWA / AAB |
| `roku/` | Roku Channel Store | deferred (native) |

Copy-paste listing text: `store-listings/`.

## User onboarding

Point users to **/tv** on your instance for QR codes, PIN pairing steps, and per-platform instructions.

## PIN pairing (multi-instance)

TV PIN codes are stored in SQLite (`tv_pair_codes`). All app server processes must share the same `DATABASE_URL` file for pairing to work across restarts and replicas.
