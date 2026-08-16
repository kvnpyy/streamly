# Changelog

All notable changes to [Streamly](https://iptvwebplayer.org) are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Also published at **[iptvwebplayer.org/changelog](https://iptvwebplayer.org/changelog)**.

---

---

---

---

---

---

---

## [Unreleased]

---

## [0.13.14] — 2026-08-15

Keep live events playing on Samsung and other smart TVs without flipping channels.

### Fixed
- **TV live freeze** — Tizen/webOS/Silk decoder stalls stop `timeupdate`, so the old 32s stuck check never ran. A 1s poll now recovers automatically: gentle media recover, then live reload, then a full rebuild (same as flipping the channel).
- **TV live events** — stay further behind the unstable edge, tolerate playlist holes, and keep MSE memory modest so the picture is less likely to freeze mid-event.

---

## [0.13.13] — 2026-08-14

Stop live TV skip/stall from Chromecast pre-warm hammering `/api/cast/resolve`.

### Fixed
- **Live Cast pre-warm** — no longer rebuilds on every `timeupdate` or retries resolve in a loop on 422; live background prep only runs when Cast UI is open or already casting, with a failure cooldown so parallel `cast=1` fetches stop fighting provider connection limits.

---

## [0.13.12] — 2026-08-10

Brazil-friendly Portuguese defaults, stronger IPTV Web Player SEO, and new guides.

### Added
- **Guides** — [Best IPTV Web Player for Xtream Codes in 2026](https://iptvwebplayer.org/blog/best-iptv-web-player-xtream-codes-2026), [How to Use an IPTV Web Player (No App Needed)](https://iptvwebplayer.org/blog/how-to-use-iptv-web-player), and pt-BR [Como usar o Streamly](https://iptvwebplayer.org/blog/como-usar-streamly-xtream-m3u).
- **VOD language** — Brazilian panel tags (`BR`, `BRASIL`, …) map to Portuguese; filter label **Português**.

### Changed
- **Geo defaults** — Brazil IP / Brazilian timezones default Movies/Series to `PT` instead of LatAm Spanish.
- **Landing SEO** — title, H1, and hero lead: “Streamly — Modern IPTV Web Player for Xtream Codes.”

---

## [0.13.11] — 2026-08-10

VOD fallback when the browser can't decode AC-3/DTS audio.

### Fixed
- **VOD AC-3/DTS audio** — when the browser can't decode a single unsupported audio track (or plays video with silence), request server HLS transcode (`copyVideo` → AAC) instead of giving up after `swapAudioCodec()`.

---

## [0.13.10] — 2026-08-07

Category visibility settings and Docker SQLite bootstrap fix.

### Added
- **Category visibility** — Settings → choose which Live / Movies / Series categories appear in pickers (per Xtream login).

### Fixed
- **Docker / fresh SQLite** — startup now creates core tables (`users`, `auth_tokens`, provider accounts, etc.) so account signup works without a manual `npm run db:push`.

---

## [0.13.8] — 2026-07-24

Download VOD episodes to disk before transcoding so playback no longer stalls or loops mid-episode.

### Fixed
- **VOD mid-episode pause/loop** — download the source file locally first, then run ffmpeg from disk so a dropped provider connection cannot freeze or loop the playlist.
- **False episode complete** — early `#EXT-X-ENDLIST` is ignored until ~92% of known duration (or a full source download) is encoded.
- **Series finale loop** — re-wire transcode end detection so autoplay advances instead of hls.js live-sync snapping back.
- **Stream ENOENT** — missing `index.m3u8` returns soft 503 and restarts the job instead of throwing.

### Added
- **VOD source cache** — `STREAM_VOD_SOURCE_DIR` / `STREAM_VOD_SOURCE_START_BYTES` (disable with `STREAM_VOD_SOURCE_CACHE=0`).

---

## [0.13.7] — 2026-07-18

Brave cast guidance, Continue Watching sync via PIN, and one clear search bar.

### Fixed
- **Cast (Brave → Samsung)** — Media Router / Shields recovery tips; Chromecast built-in required (not Smart View).
- **Continue Watching** — PIN pairing carries Streamly session so progress syncs phone → TV; faster TV pull and server-side merge.
- **Search** — single TopBar field on Live/Movies/Series; min length 2 everywhere; retry when search APIs fail.

---

## [0.13.6] — 2026-07-18

Quieter API health alerts and steadier VOD resume after background.

### Fixed
- **Monitor** — stop duplicate API health alert emails.
- **Player** — resume VOD after background at the saved position.

---

## [0.13.5] — 2026-07-16

Resume VOD after a break at the right time — not 00:00.

### Fixed
- **Pause → break → play at 00:00** — wake full-reinit now restores absolute position / `tc_seek` instead of cold-starting the episode.
- **Duplicate ffmpeg** — serialize per-job spawn so concurrent resume paths cannot orphan multiple encodes on one cache dir.

---

## [0.13.4] — 2026-07-16

Stop mid-episode Unable to play when the VPS is briefly overloaded.

### Fixed
- **VOD hard-fail mid-play** — soft-retry 502 while an episode is already playing; resume failed ffmpeg jobs from flushed segments; lighter `ultrafast` x264 default.

---

## [0.13.3] — 2026-07-16

Stop VOD transcode playback from skipping a second when encode lags.

### Fixed
- **VOD skip/stutter** — in-progress HLS playlists hold back the freshest segments; player retries 503 prep instead of jumping ~1s buffer holes; hls.js stays further behind the encode edge.

---

## [0.13.2] — 2026-07-12

Live Trending on TV loads much faster from cache.

### Fixed
- **Trending on TV speed** — warm assembled shelf is served even when the browser sends EPG hints; React Query no longer refetches as IndexedDB fills; cold hint wait cut from 2.5s to 400ms (skipped when local titles are warm).

---

## [0.13.1] — 2026-07-11

Fix Live TV black screen on smart TVs after opening a channel.

### Fixed
- **TV live black screen** — brief visibility/pagehide flickers on Silk/Tizen/webOS no longer pause HLS without resume; wake always restarts `startLoad()`.

---

## [0.13.0] — 2026-07-11

Favorite channels from the All Channels category popout.

### Added
- **Category overlay My List** — heart toggle on each channel row when you open a category from All Channels (“See all”), synced with My List prefs and cloud favorites.

---

## [0.12.1] — 2026-07-10

Fix Chromecast title-only stall; add cast monitoring.

### Fixed
- **Cast HEVC reuse** — stop sending the browser’s active HLS level (often HEVC/Dolby); always resolve a cast-safe rung from the master.
- **Cast live segment UA** — keep `type=hls` on cast live segments so upstream uses Smarters UA (VLC UA was 403ing many CDNs).
- **Cast stall detection** — if the TV never reaches PLAYING within ~18s, show an actionable error instead of silent title+icon.

### Added
- **Cast metrics** — funnel counters in `/api/metrics` (`cast.prep_*`, `cast_stall`, `cast_stream_4xx`, …).
- **`/api/cast/events`** — client reports prep/load/playing/stall for the funnel.
- **`/api/cast/diag`** — token-gated probe (browser vs Chromecast UA + first segment) for support debugging.

---

## [0.12.0] — 2026-07-09

Cast to TV starts faster and more reliably; iPhone gets real AirPlay.

### Added
- **Cast pre-warm** — resolve and warm Chromecast-safe HLS while watching so Cast to TV is near-instant.
- **`/api/cast/resolve`** — server picks a single playable media playlist for live cast.
- **Persistent Cast button** — Cast in the main player chrome; connected sessions follow channel changes.
- **iOS AirPlay** — AirPlay picker from the player; Share prioritizes AirPlay and a TV-safe proxied URL.

### Fixed
- **Title + cast icon, no video** — stop sending master playlists / raw MKV to the default Chromecast receiver.
- **TV-safe copy URL** — Share copies same-origin `/api/stream?cast=1` instead of the raw provider URL.

---

## [0.11.14] — 2026-07-07

Mobile live TV recovers when audio plays but the picture stays frozen.

### Fixed
- **Mobile live audio-only** — auto-reload on a safer HLS quality rung when video dimensions stay zero; Try again on the banner.
- **Native iOS frozen frame** — reload the stream when playback time stops advancing (without buffer-low seeks that caused jumps).
- **Phone live quality lock** — start on the lowest browser-safe rung so ABR cannot drift into HEVC/Dolby mid-playback.

### Changed
- **www redirect** — Caddy redirects `www` to apex domain.

---

## [0.11.12] — 2026-07-04

Mobile and desktop get stronger background recovery after tab sleep or bfcache restore.

### Fixed
- **pagehide / pageshow** — recover after mobile Safari bfcache and tab restore, not only `visibilitychange`.
- **freeze / resume** — suspend and recover on Android Chrome page lifecycle events.
- **iOS long background** — full pipeline reinit after 60s+ hidden instead of only calling `play()` on a stale native HLS session.

---

## [0.11.11] — 2026-07-04

TV browsers no longer freeze after overnight standby when leaving the player.

### Fixed
- **TV overnight freeze** — suspend HLS on TV/tab sleep (`pause` + `stopLoad`) instead of leaving a stale MSE session running overnight.
- **Wake recovery** — soft HLS reload on resume; removed `video.load()` wake path that froze Samsung/Fire TV browsers after standby.
- **Player close** — defer `hls.destroy` on close so browse UI remount does not race teardown and lock the whole browser tab.

---

## [0.11.9] — 2026-07-01

Pause is respected during MKV transcode; no more random resume or skip.

### Fixed
- **Pause** — transcode fragment loads no longer call `video.play()` on every segment (fixes unprompted resume and timeline jumps while paused).
- **Edge watcher removed** — the transcode buffer interval no longer runs `hls.startLoad` or dispatches fake `ended` events mid-episode.
- **Autoplay** — next-episode advance ignores synthetic `ended` while paused and skips countdown when the user has paused.

---

## [0.11.7] — 2026-07-01

Stabilize series transcode playback and stop false autoplay skips.

### Fixed
- **Transcode ended detection** — HLS snap-backs and encode stalls no longer dispatch `ended` mid-episode; autoplay only runs at the real finale or on native `ended`.
- **Player startup** — episode transcode URL is set once per episode in layout; prep UI no longer resets when transcode flags flip mid-playback.
- **Series warm / autoplay** — disabled neighbor transcode warming and removed transcode-buffer polling that advanced episodes early.

---

## [0.11.5] — 2026-07-01

Series playback no longer auto-advances when transcode encode stalls mid-episode.

### Fixed
- **False episode end** — reaching the live transcode buffer edge no longer fires `ended` unless the playhead is actually near the episode finale (fixes frequent auto-skip to the next episode).
- **Series warm** — only the immediate next episode is warmed, after a delay; prev-episode and wrap-around warm removed to avoid single-connection panel contention.
- **Resume bootstrap** — timeline hold is applied atomically on episode change so continue-watching is not cleared before the pipeline starts.

---

## [0.11.3] — 2026-07-01

Series episodes no longer restart or skip on first play.

### Fixed
- **Series binge warm** — neighboring episodes are no longer fetched as raw MKV (which tripped single-connection panels and caused opening-credit flashes).
- **Resume + transcode** — continue-watching position is applied on the first transcode request (`tc_seek`) instead of starting at 0s and seeking after decode begins.
- **Player startup** — transcode URL is set before the playback pipeline attaches, avoiding a one-time restart at the beginning of each episode.

---

## [0.11.2] — 2026-07-01

VOD probing no longer exhausts single-connection IPTV panels.

### Fixed
- **VOD format probe** — only checks MP4 once (not MP4/M4V/MOV/TS); stops on provider busy (502/551) instead of burning four slots.
- **VOD fallback** — brief cooldown before opening the declared MKV stream so single-connection panels can release.
- **MKV + transcode** — skips pre-play extension probes when server transcode is enabled.
- **Series detail** — removed automatic transcode warm on page load that opened a provider connection before Play.

---

## [0.11.1] — 2026-07-01

Live TV search finds channels across the full catalog.

### Fixed
- **Live TV search** — server-side name search scans the full channel list instead of a 240-row sample; programme (EPG) title search is on by default.
- **Live shelf search playback** — channels from search results play without requiring a shelf row context.

---

## [0.11.0] — 2026-07-01

Discovery shelf filters, smarter For You rows, and gentler VOD format probing.

### Added
- **VOD format probe (`probe=1`)** — sequential MP4/M4V/MOV/TS checks with a 700ms gap and 16-byte upstream sniff so single-connection panels are not exhausted before MKV transcode.

### Fixed
- **Movies/Series discovery shelves** — shelves stay visible when category, language, or search filters are active; only non-matching titles are removed.
- **For you vs Continue Watching** — For You suggests unwatched titles by genre taste; excludes continue-watching recents.
- **VOD playback on strict panels** — format probing no longer hammers the provider with parallel extension requests before MKV fallback.

---

## [0.10.5] — 2026-06-27

Probe for MP4 and other browser-friendly VOD formats before defaulting to MKV.

### Added
- **VOD format probe** — when panel metadata says MKV (or another risky container), try MP4/M4V/MOV/TS via a lightweight `/api/stream` check before playback; use `direct_source` when the panel provides one.

---

## [0.10.4] — 2026-06-27

Sanitize player error messages when providers return HTML.

### Fixed
- **Player errors** — no more raw HTML/Cloudflare pages in the "Unable to play" overlay; show plain-language fallbacks instead.

---

## [0.10.3] — 2026-06-27

Player close freeze fix for mobile and desktop browsers.

### Fixed
- **Player close** — defer HLS teardown on every client (not only TV/Silk); mobile phones and desktop Chrome get the same non-blocking close path as living-room TVs.

---

## [0.10.2] — 2026-06-27

Fix TV player close freezing the app.

### Fixed
- **Player close on TV** — defer browse remount and HLS teardown so the overlay dismisses before heavy work; guard double-close and history cleanup races.
- **TV close control** — floating X stays pointer-reachable; Backspace closes like other remotes.

---

## [0.10.1] — 2026-06-27

Faster TV navigation between hub and Live/VOD/Series pages.

### Changed
- **TV hub prefetch** — warm route chunks and slim catalogs while on the home menu; tiles prefetch on D-pad focus.
- **Shorter TV deferrals** — catalog fetch, discovery shelves, live browse UI, and shelf loading start sooner on living-room TVs.
- **Back to Home** — TV sub-nav prefetches the hub route on focus.

---

## [0.10.0] — 2026-06-27

TV Live browse defaults and tighter North America region filtering.

### Changed
- **TV Live** opens into category shelves by default; Guide/List toggle removed on living-room TVs.
- **Live TV search** — keyboard no longer dismisses after one letter; category lists scroll while filtering.
- **North America filter** — Arabic, Latin American, and other foreign shelves hidden unless that region is selected.
- **Live catalog API** — no unfiltered channel fallback when regional sampling returns empty.

---

## [0.9.0] — 2026-06-26

VPS capacity monitoring — know when to upgrade your server.

### Added
- **Host metrics collector** — cron-friendly script samples RAM, CPU, disk, and egress every 5 minutes.
- **`GET /api/metrics`** — protected endpoint for Node memory, concurrent proxy streams, and upgrade signals.
- **`npm run monitor:report`** — capacity report with `ok` → `watch` → `upgrade_soon` → `upgrade_now` findings.
- **`scripts/vps-monitoring-setup.sh`** — one-time VPS installer (secret, `vps-spec.json`, cron, logrotate).

---

## [0.8.2] — 2026-06-26

TV Live UI overhaul — readable 10-foot text, fixed category picker freeze.

### Fixed
- **Categories freeze on TV** — full-screen paginated category grid replaces the heavy modal/virtualizer that locked the page.
- **Tiny text on Samsung / TV browsers** — living-room font scale no longer shrinks to 80% at 100% browser zoom.
- **TV Guide readability** — taller rows, wider channel column, larger programme text and controls.

### Changed
- **TV Live toolbar** — larger Categories, Browse, and TV Guide buttons; Continue Watching hidden on guide view.
- **Category pick** on TV opens channel list overlay (same as shelf “See all”) instead of filtering into the desktop grid.

---

## [0.8.1] — 2026-06-26

Live TV layout fills wide screens — no more empty shelf gaps on TV.

### Fixed
- **Live TV blank space** — "+N more" sits inline after channel cards instead of on the far edge; shelves show up to 10 channels per row on TV.
- **TV channel card sizing** — responsive widths scale with viewport so rows use the full screen.
- **TV Guide height** — programme grid uses more vertical space on living-room TVs.

### Changed
- **TV Live page** — tighter padding and compact header so browse/guide content gets more room.

---

## [0.8.0] — 2026-06-26

TV discovery browse, cable-style live guide, and Balkan region filtering.

### Added
- **TV Movies/Series discovery** — horizontal shelves (Continue Watching, For You, Trending, Top Rated, Newly Added) on the landing view before category pick.
- **TV Live TV guide** — Browse / TV Guide toggle with horizontal category shelves (now-playing subtitles) and a cable-style programme grid with EPG on living-room TVs.
- **Browse by category** section below discovery rows on TV VOD pages.

### Fixed
- **TV blank space** — movie/series grids and settings tiles use full screen width on large TVs.
- **Wrong region channels** — Balkan IPTV prefixes (`|BLN|`, `|HRV|`, `|MKD|`) and country names (Bosnia, Croatia, etc.) map to Europe and hide from North America.

### Changed
- **TV hub** — Movies and Series subtitles now say “Discover & browse”.
- **TV settings** — four-column tile layout on wide screens.

---

## [0.6.0] — 2026-06-25

Chromecast live playback and TV-simple UI.

### Added
- **TV simple hub** — four large tiles (Live TV, TV Series, Movies, Settings) with no catalog work on home.
- **TV lightweight browse** — category-first live, movies, and series; no discovery shelves or EPG scans on TV.
- **Saved playlist edit (web)** — inline form to update server, username, password, and name on Settings → Saved playlists.

### Fixed
- **TV “Application error” on join** — align server and client TV detection via middleware hints so login PIN tab and living-room shell hydrate without mismatch.
- **TV Live TV crash** — always mount live search context on `/app/live` (required by the live page shell).
- **Mobile freezes** — stop auto-loading heavy home recommendation shelves on phone/tablet; defer live catalog prefetch, cloud sync, geo detect, HLS preload, and shelf EPG scans.
- **TV browse clutter** — region filter with geo default, paginated categories, and a compact channel list instead of a dense grid.
- **Saved playlists on TV** — restore encrypted playlists when Streamly signs in after cached creds; preload playlist list in settings.
- **Chromecast live stuck on cast icon** — only send media playlists (not master manifests) to the TV; reuse the browser’s active HLS level URL when casting.
- **Cast segment fetching** — segment URLs in cast manifests now use the VOD proxy path for `.ts`/`.m4s` so Chromecast gets proper range responses.
- **Cast prep false positives** — readiness checks require actual segment references, not master-only playlists.
- **TV browser crashes on open** — skip marketing landing on TV UA; disable auto-rich home, catalog prefetch, and perf HUD on living-room clients.

### Changed
- **TV navigation** — hub has no top nav; sub-pages use Home back + Settings only.
- **TV settings** — tile menu with Playlists (switch/add/rename/remove), Account, Parental, Sign out.
- **TV focus** — stronger D-pad highlight ring and auto-focus first button on each screen.

## [0.5.0] — 2026-06-25

Mobile playlist menu, episode flip, Chromecast live, and TV chrome fixes.

### Fixed
- **Playlist restore race** — poll NextAuth before activating saved providers; retry once on failure and surface errors on onboarding.
- **Next-episode freeze/loop** — clear stale transcode timeline state when the episode identity changes.
- **Mobile playlist menu cut off** — scrollable dropdown, left-aligned on phones, pinned Manage footer.
- **Chromecast live black screen** — resolve nested HLS masters to a cast-safe variant and always tag URLs with `cast=1`.

### Changed
- **TV layout** — Discord community strip and nav link removed from TV chrome; playlist switcher visible from small breakpoints.

## [0.4.2] — 2026-06-22

Saved playlists restore reliably when signing in on a new device.

### Fixed
- **Missing playlists on new devices** — session bootstrap now waits for Streamly sign-in before loading encrypted provider accounts instead of giving up on first paint.
- **Cookie-only sessions not synced** — IPTV credentials stored only on one device are auto-saved to your Streamly account when you sign in there.

### Added
- **Saved playlist picker on onboarding** — choose from your cloud-saved playlists without re-entering Xtream credentials when auto-restore cannot reach the provider.

## [0.4.1] — 2026-06-22

Fix series episodes looping at the end of transcoded (MKV) playback.

### Fixed
- **Series replay loop at episode end** — stop hls.js after finale, detect encode-edge stall and backward snap-back, and advance autoplay even when duration metadata is missing.
- **Next-episode resume** — reset resume lock when switching episodes so binge playback starts cleanly.

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
