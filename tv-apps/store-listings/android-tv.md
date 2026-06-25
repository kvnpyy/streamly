# Store listing — Google Play (Android TV / TWA)

## App name

Streamly

## Short description (≤ 80 chars)

IPTV player for Xtream & M3U. Live TV, movies, series. Bring your subscription.

## Full description (≤ 4000 chars)

Streamly is an IPTV media player for Android TV and Google TV. Sign in with Xtream Codes or an M3U playlist from your provider.

• Live TV with EPG
• Movies and series with continue watching
• PIN pairing from your phone
• Leanback-friendly TV interface

You need your own IPTV subscription. Streamly does not sell or host channels.

Setup: https://iptvwebplayer.org/tv
Privacy: https://iptvwebplayer.org/legal/privacy

## Category

Entertainment / Video Players

## Package name (suggested)

org.streamly.iptv

## Content rating

Complete IARC questionnaire — emphasize user-provided streams, no bundled content.

## TV banner / feature graphic

- TV banner: 320×180 (optional on some devices)
- Feature graphic: 1024×500
- Icon: 512×512 — `tv-apps/androidtv/icon-512.png`

## Screenshots

Phone: not required if TV-only
TV: 1920×1080 landscape screenshots on Android TV emulator or device

## Technical

Build Trusted Web Activity with Bubblewrap using `tv-apps/androidtv/twa-manifest.json`.
Host Digital Asset Links at `https://iptvwebplayer.org/.well-known/assetlinks.json`.
