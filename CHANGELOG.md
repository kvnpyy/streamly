# Changelog

All notable changes to [Streamly](https://iptvwebplayer.org) are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Also published at **[iptvwebplayer.org/changelog](https://iptvwebplayer.org/changelog)**.

---

---

---

## [0.4.0] — 2026-06-22

Regional filtering, VOD browse improvements, and IP-based defaults.

### Fixed
- **North America region filter leaked foreign channels** — `|EU|`, `|ALB|`, and other IPTV regional prefixes are now recognized; category drill-down and see-all overlays respect the active region.
- **Movies/Series English filter hid discovery shelves** — genre rows and trending rails stay visible when a language filter is active.

### Added
- **Release date sort** for Movies and Series.
- **IP-based defaults** — Live TV region and VOD language default from geolocation (timezone fallback).

## [0.3.0] — 2026-06-19

Production bundle: Smart TV onboarding, GitHub Discussions community links, and Continue Watching reliability.

### Added
- **Smart TV setup page** (`/tv`) — QR code, PIN pairing, per-platform guides.
- **GitHub Discussions** — Feedback & Ideas thread; links in footer, Settings, README.
- **TV app store scaffolds** — `tv-apps/` wrappers for Samsung, LG, and Fire TV.
- **Persistent TV PIN pairing** — codes stored in SQLite.

### Fixed
- **Live TV Continue Watching sometimes did nothing** — play from saved recents when catalog lookup fails.
- **Movies Continue Watching** — resume from recent metadata when catalog enrichment misses.

### Changed
- **Native TV browsers** — reduced motion for snappier channel zapping.

## [0.2.40] — 2026-06-19

### Added
- **GitHub Discussions** — enabled on the repo with a **Feedback & Ideas** thread for feature thoughts (no issue required).
- **Community links** — footer, Settings, blog shell, and README point to Discussions alongside Discord.

### Changed
- Changelog page cross-links **CHANGELOG.md** on GitHub and **GitHub Discussions** for feedback.

## [0.2.39] — 2026-06-19

### Added
- **Smart TV setup page** (`/tv`) — QR code, PIN pairing steps, and per-platform guides (Samsung, LG, Fire TV, Android TV).
- **TV app store scaffolds** — `tv-apps/` wrappers for Samsung Tizen, LG webOS, and Fire TV submission.
- **Persistent TV PIN pairing** — codes stored in SQLite so linking survives restarts and multi-process deploys.

### Fixed
- **Live TV Continue Watching sometimes did nothing** — play from saved recents when catalog lookup fails; touch-friendly Watch overlay on media cards.
- **Movies Continue Watching** — resume playback from recent metadata when catalog enrichment misses.

### Changed
- **Native TV browsers** — reduced motion for snappier channel zapping on Tizen, webOS, and Silk.

## [0.2.37] — 2026-06-17

### Fixed
- **Series playback jumping backward and looping** — growing transcode HLS manifests re-fired `MANIFEST_PARSED` and reset playhead to 0; now only bootstraps once; edge nudges preserve current time.
- **Slow episode start** — non-blocking transcode warm, single ffprobe, 2s segments, pre-warm resume/next episode, MP4 HEAD probe, cached `get_series_info`.

### Changed
- **Transcode edge watchdog** — nudge only when buffer is nearly dry (≤3s ahead), debounced to avoid seek storms.

## [0.2.35] — 2026-06-17

### Fixed
- **Sentry noise from browser userscripts** — drop extension/userscript errors (`app://`, `*.user.js`) in client `beforeSend` so third-party scripts on `/login` do not create production alerts.

### Changed
- **Sentry automation prompt** — committed to repo; noise issues are auto-ignored with a comment instead of leaving alerts open.

## [0.2.32] — 2026-06-14

### Fixed
- **Mobile player controls blocked by bottom nav** — hide the tab bar while playback is open; raise player z-index above chrome; safe-area padding on control bar.
- **Cannot reopen player after close (continue watching)** — fix browse UI stuck empty after rapid close/reopen; skip stale `history.back()` when user already started playback again.

## [0.2.31] — 2026-06-14

### Fixed
- **Page unresponsive after Discord dismiss (scroll only)** — remove `touchend` preventDefault that poisoned taps on iOS; drop `content-visibility` on live shelves (broken hit targets after layout shift); hide Discord strip on mobile; defer shelf EPG on phones; close ghost-opened category overlays on dismiss.

## [0.2.30] — 2026-06-14

### Fixed
- **Discord banner dismiss freezes mobile** — defer `localStorage` write; collapse animation instead of instant unmount; block iOS ghost-tap bleed-through; debounce live shelf auto-load after layout shifts.

## [0.2.29] — 2026-06-14

### Fixed
- **Mobile navigation feels frozen between pages** — bottom nav uses non-blocking transitions; live shelf bootstrap fetches one batch then yields; catalog prefetch deferred on phones; live search context scoped to main content only.

## [0.2.28] — 2026-06-14

### Fixed
- **Mobile bottom navigation not clickable** — nav portals to `document.body` with a higher z-index; cookie banner and version badge sit above the bar instead of covering it; touch-friendly tap targets on iOS/Android.

## [0.2.27] — 2026-06-14

### Fixed
- **Live TV shelf 502 (Sentry `/app/live`)** — serve stale disk catalog before blocking on upstream; shelf APIs return a degraded empty payload instead of HTTP 502; client never throws unhandled rejections on load-more or prefetch.

## [0.2.26] — 2026-06-14

### Added
- **Discord visibility in the app** — sidebar link, mobile More menu, TV top nav, and a dismissible community strip on logged-in pages (in addition to Settings).

### Fixed
- **Live TV shelf 502 errors** — stale disk catalog fallback when upstream refresh fails; client retries and in-page “Try again” instead of unhandled rejections (Sentry `/app/live`).

## [0.2.25] — 2026-06-13

### Fixed
- **Chrome clicks blocked while scrolling** — stop EPG cache readiness from scanning thousands of IndexedDB keys every 1.5s; defer EPG hydrate on the library home route; gate home discovery shelves behind the first user interaction.
- **Desktop home auto-load** — recommendation shelves no longer auto-fetch on fine-pointer desktop; use the “Load recommendations” prompt instead.

### Changed
- Slim catalog fetches use `res.json()` directly (no worker round-trip for small payloads).
- IndexedDB EPG hydration yields to the main thread between batches.

## [0.2.24] — 2026-06-13

### Fixed
- **Chrome freeze on initial load** — home rich shelves, search, detail “similar titles”, and live category settings no longer download full provider catalogs to the browser.
- **Catalog JSON parsing** — always prefers a Web Worker when available so large responses do not block the main thread.

### Changed
- **Home recommendations** — use server discovery shelves and slim catalog counts instead of client-side top-rated / newest picks over full VOD and series arrays.
- **Search** — VOD and series queries hit paginated `/api/*/items?q=`; live name search uses a capped channel sample with chunked indexing.

## [0.2.23] — 2026-06-13

### Changed
- **Movies & Series grids** — initial load is 120 titles per request; “Show more” (and scroll) fetches additional pages from `/api/vod/items` and `/api/series/items` instead of pulling 600 rows up front.

## [0.2.22] — 2026-06-13

### Added
- **Server discovery shelves** for Movies and Series — `/api/vod/discovery-shelves` and `/api/series/discovery-shelves` return pre-built shelf rows (top rated, newly added, for you, TMDB trending, genre rails).

### Changed
- **Movies & Series browse** — discovery rows no longer trigger a client-side 800-item catalog preview fetch; shelves are assembled on the VPS from the disk-cached bundle.

## [0.2.21] — 2026-06-13

### Added
- **Slim VOD/series catalogs** — `/api/vod/catalog` and `/api/series/catalog` can return categories + counts only (`slim=1` or `x-*-catalog-slim: 1`).
- **Paginated item APIs** — `/api/vod/items` and `/api/series/items` with category, search, sort, offset/limit, and id lookup.
- **Movies & Series pages** — browse via slim catalog + server-paginated grids instead of shipping full provider catalogs to the browser.

## [0.2.20] — 2026-06-13

### Fixed
- **Library / browse freezes on Chrome and desktop** — discovery EPG and catalog indexing no longer monopolize the main thread on initial load; VOD search indexes build lazily in chunks.

## [0.2.19] — 2026-06-13

### Fixed
- **Player close freeze** on TV, Fire TV Silk, and some mobile/PC browsers — teardown no longer blocks the main thread; history cleanup and browse remount are deferred; exit control stays reachable when controls auto-hide.

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
