/**
 * Release notes — keep in sync with CHANGELOG.md at the repo root.
 * Latest entry version should match package.json (see changelog.test.ts).
 */
export type ChangelogEntry = {
  version: string;
  date: string;
  summary: string;
  highlights: readonly string[];
};

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: "0.6.0",
    date: "2026-06-25",
    summary: "Chromecast live playback and TV-simple UI.",
    highlights: [
      "TV hub: four large tiles (Live, Series, Movies, Settings) — zero catalog load on home.",
      "Fix TV application error on join — server/client TV hints prevent hydration crash.",
      "Fix Live TV crash on TV — live search provider always mounted on /app/live.",
      "TV settings: tile menu with playlist switch, add, rename, and remove.",
      "Web settings: restore inline Edit for saved playlists (server, login, name).",
      "Mobile: stop auto-loading heavy home shelves; defer catalog prefetch, cloud sync, and HLS preload.",
      "Stronger D-pad focus ring and auto-focus on each TV screen.",
      "TV browse: pick a category, then channels or titles — no EPG/discovery shelves.",
      "TV UA skips marketing landing; no auto-rich home, prefetch, or perf HUD on living-room clients.",
      "Chromecast: media playlists only, active HLS level reuse, VOD proxy for segments.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-06-25",
    summary:
      "Mobile playlist menu, episode flip, Chromecast live, and TV chrome fixes.",
    highlights: [
      "Poll NextAuth before restoring saved playlists; retry activation and show errors on onboarding.",
      "Clear stale transcode timeline when flipping episodes — fixes next-episode freeze and rewind loops.",
      "Mobile playlist dropdown scrolls and stays on-screen; Playlists link in More menu and settings anchor.",
      "Hide Discord strip on TV; recursive Chromecast live HLS variant resolution with cast=1 URLs.",
    ],
  },
  {
    version: "0.4.2",
    date: "2026-06-22",
    summary: "Saved playlists restore reliably when signing in on a new device.",
    highlights: [
      "Wait for Streamly session before restoring encrypted provider accounts — fixes empty library on new devices.",
      "Auto-save cookie-only IPTV sessions to your Streamly account when you sign in later.",
      "Onboarding shows your saved playlists so you can pick one without re-entering credentials.",
    ],
  },
  {
    version: "0.4.1",
    date: "2026-06-22",
    summary: "Fix series episodes looping at the end of transcoded playback.",
    highlights: [
      "Stop hls.js manifest polling when a transcoded episode reaches the encode edge — prevents snap-back to segment 0.",
      "Detect backward playhead jumps and encode-caught-up finale even without reliable duration metadata.",
      "Finale autoplay countdown works when duration hints are wrong; resume lock resets on episode change.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-06-22",
    summary:
      "Regional filtering fixes, release-date sort, and IP-based region/language defaults.",
    highlights: [
      "North America filter no longer shows |EU|, |ALB|, and other foreign IPTV category blocks.",
      "Category see-all and list view respect the active TV region.",
      "Release date sort for Movies and Series; discovery shelves stay visible with language filters.",
      "Live TV region and VOD language default from IP geolocation (timezone fallback).",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-06-19",
    summary:
      "Smart TV onboarding, GitHub Discussions for feedback, and Live Continue Watching fixes.",
    highlights: [
      "/tv setup page with QR code, PIN pairing, and Samsung/LG/Fire TV guides.",
      "GitHub Discussions — Feedback & Ideas thread linked from footer, Settings, and README.",
      "Live Continue Watching plays from recents when catalog lookup fails.",
      "TV PIN codes persist in SQLite across restarts and multi-instance deploys.",
    ],
  },
  {
    version: "0.2.40",
    date: "2026-06-19",
    summary: "GitHub Discussions for low-friction feedback; changelog links across the site.",
    highlights: [
      "GitHub Discussions enabled with a pinned Feedback & Ideas thread — share thoughts without opening an issue.",
      "Footer, Settings, blog shell, and README link to Discussions alongside Discord.",
      "CHANGELOG.md and /changelog stay in sync for release notes on GitHub and the live site.",
    ],
  },
  {
    version: "0.2.39",
    date: "2026-06-19",
    summary:
      "Smart TV onboarding, persistent PIN pairing, and reliable Live Continue Watching.",
    highlights: [
      "/tv setup page with QR code, PIN steps, and Samsung/LG/Fire TV guides.",
      "TV PIN codes persist in SQLite — survives restarts and multi-instance VPS deploys.",
      "Live Continue Watching plays from recents when catalog lookup fails; touch-friendly Watch buttons.",
      "tv-apps/ scaffolds for Samsung, LG, and Fire TV store wrappers.",
    ],
  },
  {
    version: "0.2.37",
    date: "2026-06-17",
    summary: "Faster episode start and fix for series playback jumping backward and looping.",
    highlights: [
      "Transcode warm (hover/focus) no longer blocks — ffmpeg starts in the background before Play.",
      "Single ffprobe pass, 2s HLS segments, and pre-warm on resume/next episode cut cold-start latency.",
      "Fix growing HLS manifest refresh resetting playhead to 0 (backward seek / loop on TV and desktop).",
      "Cache get_series_info for 5 minutes — series pages load faster on repeat visits.",
    ],
  },
  {
    version: "0.2.35",
    date: "2026-06-17",
    summary: "Filter browser userscript errors out of Sentry so third-party scripts do not trigger production alerts.",
    highlights: [
      "Client beforeSend drops extension and Tampermonkey-style stack frames (app://, *.user.js).",
      "Sentry automation prompt committed — noise issues auto-ignored with a comment.",
    ],
  },
  {
    version: "0.2.32",
    date: "2026-06-14",
    summary: "Mobile player controls no longer sit under the tab bar; continue watching works after closing playback.",
    highlights: [
      "Bottom navigation hides during playback so fullscreen and transport controls are tappable.",
      "Fix browse page stuck blank after closing the player (race in mount gate).",
      "History cleanup no longer cancels a new play session if you tap continue watching right after close.",
    ],
  },
  {
    version: "0.2.31",
    date: "2026-06-14",
    summary: "Fix scroll-only freeze after dismissing the Discord banner.",
    highlights: [
      "Removed touchend preventDefault that blocked all taps on iOS after dismiss.",
      "Live shelf rows no longer use content-visibility (misaligned touch targets after layout shift).",
      "Discord strip hidden on mobile; shelf EPG deferred on phones; category overlay cleared on dismiss.",
    ],
  },
  {
    version: "0.2.30",
    date: "2026-06-14",
    summary: "Fix mobile freeze when dismissing the Discord community banner.",
    highlights: [
      "Dismiss defers localStorage so large IPTV session blobs cannot block the main thread.",
      "Banner collapses smoothly and blocks iOS ghost taps on content below.",
      "Live shelf scroll loader ignores layout shifts for 450ms after loads settle.",
    ],
  },
  {
    version: "0.2.29",
    date: "2026-06-14",
    summary: "Mobile page-to-page navigation stays responsive under heavy live shelf loads.",
    highlights: [
      "Bottom nav uses React transitions so taps register immediately while the next page loads.",
      "Live shelf bootstrap loads one category batch then defers the rest — no more chained fetches blocking the main thread.",
      "Catalog prefetch waits longer on phones; leaving Live aborts in-flight shelf requests.",
    ],
  },
  {
    version: "0.2.28",
    date: "2026-06-14",
    summary: "Fix mobile bottom navigation taps blocked by overlays and stacking.",
    highlights: [
      "Bottom nav renders in a body portal at z-100 so page content cannot steal touches.",
      "Cookie consent and version badge offset above the nav bar on /app routes.",
      "Nav links use touch-manipulation and solid backdrop for reliable iOS taps.",
    ],
  },
  {
    version: "0.2.27",
    date: "2026-06-14",
    summary: "Complete Live TV shelf 502 fix — stale-first catalog and graceful degradation.",
    highlights: [
      "Expired disk catalog is served immediately while upstream refresh runs in the background.",
      "Shelf batch and preview APIs return empty shelves with catalogUnavailable instead of HTTP 502.",
      "Load-more and prefetch paths set in-page errors instead of unhandled promise rejections.",
    ],
  },
  {
    version: "0.2.26",
    date: "2026-06-14",
    summary: "Discord links across logged-in app chrome; Live TV shelf 502 resilience.",
    highlights: [
      "Join Discord in sidebar, mobile More menu, TV nav, and a dismissible strip on app pages.",
      "Live shelf batch uses stale catalog cache when upstream refresh fails.",
      "Shelf load failures show Try again instead of crashing the Live TV page.",
    ],
  },
  {
    version: "0.2.25",
    date: "2026-06-13",
    summary: "Fix Chrome click blocking — defer EPG scans and home discovery until after interaction.",
    highlights: [
      "EPG cache readiness stops polling after warmup instead of scanning the full store every 1.5s.",
      "Library home defers IndexedDB EPG hydration and prefs rehydrate so navigation stays clickable.",
      "Desktop Chrome no longer auto-loads heavy home shelves — opt in via Load recommendations.",
      "Slim catalog APIs parse with res.json() to avoid worker structured-clone overhead.",
    ],
  },
  {
    version: "0.2.24",
    date: "2026-06-13",
    summary: "Fix Chrome freeze on initial load — eliminate remaining full-catalog client fetches.",
    highlights: [
      "Home rich shelves use server discovery APIs instead of downloading entire VOD and series catalogs.",
      "Search uses paginated item APIs; live name search uses a capped channel sample with chunked indexing.",
      "Movie and series detail pages load a category preview for similar titles, not the full catalog.",
      "Catalog JSON parsing always prefers a Web Worker when available.",
    ],
  },
  {
    version: "0.2.23",
    date: "2026-06-13",
    summary: "Paginated Movies and Series grids — 120 titles per page with load more.",
    highlights: [
      "Catalog grids fetch 120 items at a time instead of 600 on first paint.",
      "Show more button and scroll sentinel load the next page from the VPS.",
      "Virtual grid renders all loaded pages without the old 400-item display cap.",
    ],
  },
  {
    version: "0.2.22",
    date: "2026-06-13",
    summary: "Server-built Movies and Series discovery shelves — no 800-item preview fetch.",
    highlights: [
      "New /api/vod/discovery-shelves and /api/series/discovery-shelves build top rated, new, for-you, trending, and genre rails on the VPS.",
      "TMDB trending matching runs server-side from the cached catalog bundle.",
      "Movies and Series pages no longer download an 800-title preview blob for discovery rows.",
    ],
  },
  {
    version: "0.2.21",
    date: "2026-06-13",
    summary: "Server-side slim VOD/series catalogs with paginated item APIs.",
    highlights: [
      "Movies and Series load category metadata only — titles paginate from /api/vod/items and /api/series/items.",
      "Disk-cached full bundles on the VPS; browser no longer downloads entire movie/series catalogs up front.",
      "P0 click-through tests for slim grid, genre filter, and search on Movies and Series.",
    ],
  },
  {
    version: "0.2.20",
    date: "2026-06-13",
    summary: "Fix library and browse freezes on Chrome and desktop browsers.",
    highlights: [
      "Defer discovery EPG and yield between batches on all clients — not only TV.",
      "Lazy/chunked VOD name indexes; skip heavy category maps until a genre is opened.",
      "Smaller catalog JSON uses Web Worker parsing sooner; home rich shelves load later.",
    ],
  },
  {
    version: "0.2.19",
    date: "2026-06-13",
    summary: "Fix player close freezing on TV, Fire TV Silk, and mobile.",
    highlights: [
      "Skip sync video.load() on teardown — avoids main-thread hangs on embedded browsers.",
      "Defer history.back() and browse remount when closing the player overlay.",
      "Always-visible exit control when TV/mobile chrome is hidden; Close on stall overlay.",
    ],
  },
  {
    version: "0.2.18",
    date: "2026-06-13",
    summary: "Production release — cross-platform UX parity (P0–P3) and player polish.",
    highlights: [
      "P0: TV EPG guide, tablet bottom nav at 1024px, Fire TV Silk remote hints.",
      "P1: Mobile EPG/PiP, compact top bar, TV movies/series shelf-first browse.",
      "P2–P3: useLivingRoomShell/useNativeTvUa, TvHomeHub, iPad policy, QA checklist.",
    ],
  },
  {
    version: "0.2.17",
    date: "2026-06-13",
    summary: "Living-room architecture cleanup, TV home hub, and mobile polish.",
    highlights: [
      "Split useLivingRoomShell vs useNativeTvUa — clearer TV shell vs native UA playback.",
      "iPad stays on mobile/desktop shell unless Comfort TV or a real TV browser.",
      "TvHomeHub wired into rich TV home; larger bottom-nav tap targets; compact landscape guide.",
      "scripts/qa-device-checklist.mjs — manual device QA list + optional P0 automation.",
    ],
  },
  {
    version: "0.2.16",
    date: "2026-06-13",
    summary: "Mobile player controls, compact top bar, and TV VOD shelf browse.",
    highlights: [
      "Phone player — EPG schedule and Picture-in-Picture buttons visible on small screens (hidden on TV).",
      "Top bar — route title on phones; icon-only playlist switcher below the sm breakpoint.",
      "Movies & Series on TV — shelf-first browse with D-pad-friendly rows; full grid when a genre is selected.",
    ],
  },
  {
    version: "0.2.15",
    date: "2026-06-13",
    summary: "Cross-platform UX parity — TV guide, tablet nav, Fire TV hints.",
    highlights: [
      "Samsung / TV live — List/Guide toggle now opens the full EPG grid (category rail + modal on guide).",
      "Tablet breakpoint unified at 1024px — bottom nav on phones and tablets, sidebar on desktop.",
      "Fire TV Silk — remote control hints banner in the player (same as native TV browsers).",
    ],
  },
  {
    version: "0.2.14",
    date: "2026-06-13",
    summary: "README guides, changelog page, and release notes everywhere.",
    highlights: [
      "GitHub README — Featured guides table linking all four blog posts.",
      "CHANGELOG.md on GitHub and /changelog on the site (What's new in v0.2.x).",
      "Version badge in the player links to release notes; footer and Settings links.",
    ],
  },
  {
    version: "0.2.12",
    date: "2026-06-13",
    summary: "Guides, changelog, and community polish.",
    highlights: [
      "Four blog guides live — weekend build log, $5 VPS costs, Docker self-host, Xtream vs M3U.",
      "Changelog page on the site plus CHANGELOG.md for GitHub.",
      "Discord community links across footer, settings, and welcome email.",
    ],
  },
  {
    version: "0.2.11",
    date: "2026-06-13",
    summary: "Google Analytics actually collects data now.",
    highlights: [
      "Default GA4 measurement ID for iptvwebplayer.org when env is unset.",
      "SPA page_view events on client navigations.",
    ],
  },
  {
    version: "0.2.10",
    date: "2026-06-13",
    summary: "Official Discord community.",
    highlights: [
      "Permanent invite linked from landing page, login, and Settings.",
      "Welcome email includes optional Join Discord CTA.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06-01",
    summary: "Binge UX and VOD playback hardening.",
    highlights: [
      "Autoplay next episode overlay for series.",
      "VOD transcode seek/resume fixes and MKV/HEVC fallback path.",
      "Catalog sort toggles and genre bars on movies/series.",
      "Playback speed and multi-audio track selection in the player.",
      "Live Trending on TV shelf EPG hints and cache improvements.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-01",
    summary: "First public Streamly release.",
    highlights: [
      "Xtream Codes and M3U login with proxied HLS playback.",
      "Live TV shelves, movies, series, global search, and custom player.",
      "TV browser layout with D-pad navigation and TV pairing PIN.",
      "Three-tier EPG fallback chain and optional TMDB artwork.",
      "Docker Compose, SQLite accounts, and MIT open source.",
    ],
  },
] as const;

export function getLatestChangelogEntry(): ChangelogEntry {
  return CHANGELOG[0];
}

export function formatChangelogVersion(version: string): string {
  return version.startsWith("v") ? version : `v${version}`;
}
