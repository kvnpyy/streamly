# Changelog

All notable changes to [Streamly](https://iptvwebplayer.org) are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Also published at **[iptvwebplayer.org/changelog](https://iptvwebplayer.org/changelog)**.

---

## [0.2.18] — 2026-06-13

Production release bundling P0–P3 UX parity, Discord/GA/changelog/blog work, and player improvements (autoplay next, cast, transcode).

## [0.2.17] — 2026-06-13

### Added
- `useLivingRoomShell()` and `useNativeTvUa()` — split TV shell vs native TV UA (`useTvBrowser` kept as alias).
- **TvHomeHub** on rich TV home (live discovery + continue + trending).
- `npm run test:qa-checklist` — manual device QA list; `npm run test:qa` runs checklist + P0 smoke tests.

### Changed
- **iPad policy** — tablets no longer auto-enter TV shell from coarse pointer alone.
- Bottom nav — larger tap targets (`min-h-12`, `size-6` icons).
- Live guide — compact 6-hour / narrower channel column in phone landscape.

## [0.2.16] — 2026-06-13

### Added
- Phone player — **Schedule** (EPG) and **Picture-in-Picture** controls on small screens.
- Top bar — page title on phones; icon-only playlist switcher below `sm`.

### Changed
- Movies & Series on TV — shelf-first browse with remote-friendly rows; full grid when a genre is selected.

## [0.2.15] — 2026-06-13

### Added
- TV / Samsung live — **Guide** view with EPG grid (List/Guide toggle on couch browsers).
- Fire TV Silk — player remote-hints banner.

### Changed
- Shell navigation — bottom nav below **1024px** (phones + tablets); sidebar at desktop widths.

## [0.2.14] — 2026-06-13

### Added
- GitHub README **Featured guides** table — links to all four blog posts.
- **CHANGELOG.md** on GitHub and [/changelog](https://iptvwebplayer.org/changelog) on the site.
- Version badge in the app links to release notes.

## [0.2.12] — 2026-06-13

### Added
- Four blog guides: [weekend build](https://iptvwebplayer.org/blog/nextjs-iptv-weekend-build), [$5 VPS costs](https://iptvwebplayer.org/blog/streamly-five-dollar-vps), [Docker self-host](https://iptvwebplayer.org/blog/how-to-self-host-streamly), [Xtream vs M3U](https://iptvwebplayer.org/blog/xtream-codes-vs-m3u).
- Changelog page on the site and this file for GitHub.
- Discord community links (footer, settings, welcome email).

## [0.2.11] — 2026-06-13

### Fixed
- Google Analytics — default GA4 measurement ID when env is unset; SPA `page_view` on route changes.

## [0.2.10] — 2026-06-13

### Added
- Official [Discord community](https://discord.gg/QGFKJt9t7A) linked across the site.

## [0.2.0] — 2026-06-01

### Added
- Autoplay next episode overlay for series.
- Catalog sort toggles and genre bars on movies/series.
- Playback speed and audio track selection in the player.

### Fixed
- VOD transcode seek/resume and MKV/HEVC browser fallback.
- Live Trending on TV shelf EPG hints and cache TTL improvements.

## [1.0.0] — 2026-05-01

### Added
- Xtream Codes and M3U login with proxied HLS playback.
- Live TV shelves, movies, series, global search, custom HLS player.
- TV browser layout, D-pad navigation, and TV pairing PIN.
- Three-tier EPG fallback and optional TMDB artwork.
- Docker Compose, SQLite accounts, MIT license.

[0.2.14]: https://github.com/kvnpyy/streamly/compare/v1.0.0...HEAD
[0.2.13]: https://github.com/kvnpyy/streamly/compare/v1.0.0...HEAD
