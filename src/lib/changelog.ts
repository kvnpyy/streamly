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
    version: "0.13.1",
    date: "2026-07-11",
    summary: "Fix Live TV black screen on smart TVs after opening a channel.",
    highlights: [
      "Player: delay background suspend so brief TV visibility flickers no longer pause HLS forever.",
      "Player: wake from pagehide/pageshow always resumes loading (not only bfcache).",
      "Player: after a real suspend, video.play() also restarts hls.js startLoad().",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-07-11",
    summary: "Favorite channels from the All Channels category popout.",
    highlights: [
      "Live: heart toggle on category overlay channel rows (“See all”) to add or remove from My List.",
      "My List: same local prefs + cloud sync as the rest of the app.",
    ],
  },
  {
    version: "0.12.1",
    date: "2026-07-10",
    summary: "Fix Chromecast title-only stall; add cast monitoring.",
    highlights: [
      "Cast: always resolve a cast-safe H.264 ladder from the master — never reuse the browser’s HEVC/Dolby rung.",
      "Cast: live segments keep type=hls (Smarters UA) so Chromecast can fetch IPTV CDNs.",
      "Cast: 18s stall watchdog when the TV never reaches PLAYING.",
      "Ops: cast funnel in /api/metrics, client /api/cast/events, token-gated /api/cast/diag.",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-07-09",
    summary: "Cast to TV starts faster and more reliably; iPhone gets real AirPlay.",
    highlights: [
      "Cast: pre-warm Chromecast-safe HLS while you watch so Cast to TV is near-instant.",
      "Cast: server resolve picks a playable media playlist — fixes title + cast icon with no video.",
      "Cast: persistent Cast button, auto-follow when already connected, poster metadata, MKV via HLS only.",
      "iOS: AirPlay picker from the player; Share copies a TV-safe proxied URL instead of the raw provider link.",
    ],
  },
  {
    version: "0.11.14",
    date: "2026-07-07",
    summary: "Mobile live TV recovers when audio plays but the picture stays frozen.",
    highlights: [
      "Player: auto-reload on audio-only live playback and native iOS frozen-frame recovery.",
      "Player: pin phone live streams to browser-safe HLS quality rungs (HEVC/Dolby drift).",
      "Player: Try again on the “hearing audio but no picture” banner.",
      "Infra: redirect www to apex in Caddy.",
    ],
  },
  {
    version: "0.11.12",
    date: "2026-07-04",
    summary: "Mobile and desktop get stronger background recovery after tab sleep or bfcache restore.",
    highlights: [
      "Player: listen for pagehide/pageshow and freeze/resume — covers mobile Safari bfcache and Android tab discard.",
      "Player: iPhone/iPad after long background now full pipeline reinit instead of a bare play() on a stale native HLS session.",
      "Player: shared recovery planner for all clients — gentle/soft HLS on Chromium, safe reinit everywhere.",
    ],
  },
  {
    version: "0.11.11",
    date: "2026-07-04",
    summary: "TV browsers no longer freeze after overnight standby when leaving the player.",
    highlights: [
      "Player: suspend HLS on TV/tab sleep (pause + stopLoad) instead of leaving a stale MSE session overnight.",
      "Player: wake recovery uses soft HLS reload — never sync video.load(), which froze Samsung/Fire TV after standby.",
      "Player: defer hls.destroy on close so browse remount does not race teardown and lock the whole browser.",
    ],
  },
  {
    version: "0.11.9",
    date: "2026-07-01",
    summary: "Pause is respected during MKV transcode; no more random resume or skip.",
    highlights: [
      "Player: stop calling play() on every transcode fragment — fixes unprompted resume while paused.",
      "Player: remove transcode edge watcher that nudged HLS and fired fake ended events.",
      "Autoplay: ignore synthetic ended while paused; do not advance on countdown when paused.",
    ],
  },
  {
    version: "0.11.7",
    date: "2026-07-01",
    summary: "Stabilize series transcode playback and stop false autoplay skips.",
    highlights: [
      "Player: only fire transcode ended near the real finale — HLS snap-backs mid-episode no longer advance.",
      "Player: simplify episode URL setup and stop prep UI from resetting mid-playback.",
      "Series: disable neighbor transcode warming and transcode-buffer autoplay polling.",
    ],
  },
  {
    version: "0.11.5",
    date: "2026-07-01",
    summary: "Series playback no longer auto-advances when transcode encode stalls mid-episode.",
    highlights: [
      "Player: only treat transcode as ended near the real episode finale — not when encode catches up mid-playback.",
      "Series: warm only the next episode (delayed) instead of prev/next MKV transcode jobs that stole the provider slot.",
      "Resume: fix timeline-hold race that cleared continue-watching position before the pipeline attached.",
    ],
  },
  {
    version: "0.11.3",
    date: "2026-07-01",
    summary: "Series episodes no longer restart or skip on first play.",
    highlights: [
      "Player: stop prefetching neighboring episodes as raw MKV — use transcode warm only.",
      "Player: bake resume seek into the first transcode URL so playback does not start at 0 and jump.",
      "Player: initialize transcode URL before the pipeline attaches to avoid a double restart.",
    ],
  },
  {
    version: "0.11.2",
    date: "2026-07-01",
    summary: "VOD probing no longer exhausts single-connection IPTV panels.",
    highlights: [
      "VOD: probe only MP4 (not four extensions) and stop immediately when the provider is busy.",
      "VOD: skip format probes when server MKV transcode is enabled; cooldown before fallback playback.",
      "Series: removed auto transcode warm on page load that stole provider slots before Play.",
    ],
  },
  {
    version: "0.11.1",
    date: "2026-07-01",
    summary: "Live TV search finds channels across the full catalog.",
    highlights: [
      "Live TV: server-side name search scans the full channel list instead of a 240-row sample.",
      "Live TV: programme (EPG) title search enabled by default on the Live page and shelf browse.",
      "Live TV: search results play correctly from shelf browse without a category context.",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-07-01",
    summary:
      "Discovery shelf filters, smarter For You rows, and gentler VOD format probing.",
    highlights: [
      "Movies/Series: discovery shelves stay visible under filters — only non-matching titles drop out.",
      "For You: suggests new titles from genre taste instead of repeating Continue Watching.",
      "VOD: probe MP4/M4V/MOV/TS one at a time with lightweight upstream checks before MKV transcode.",
    ],
  },
  {
    version: "0.10.5",
    date: "2026-06-27",
    summary: "Probe for MP4 and other browser-friendly VOD formats before MKV.",
    highlights: [
      "VOD format probe when panel metadata says MKV — try MP4/M4V/MOV/TS before playback.",
    ],
  },
  {
    version: "0.10.4",
    date: "2026-06-27",
    summary: "Sanitize player error messages when providers return HTML.",
    highlights: [
      "Player errors: stop showing raw HTML or Cloudflare pages in the Unable to play overlay.",
    ],
  },
  {
    version: "0.10.3",
    date: "2026-06-27",
    summary: "Player close freeze fix for mobile and desktop browsers.",
    highlights: [
      "Player close: defer HLS teardown on every client — mobile and desktop match the TV non-blocking close path.",
    ],
  },
  {
    version: "0.10.2",
    date: "2026-06-27",
    summary: "Fix TV player close freezing the app.",
    highlights: [
      "Player close on TV: defer browse remount and HLS teardown so the overlay dismisses before heavy work.",
      "Guard double-close taps and history cleanup races when exiting playback.",
      "Floating X close control stays pointer-reachable; Backspace closes like other TV remotes.",
    ],
  },
  {
    version: "0.10.1",
    date: "2026-06-27",
    summary: "Faster TV navigation between hub and Live/VOD/Series pages.",
    highlights: [
      "TV hub prefetch: warm route chunks and slim catalogs on the home menu; tiles prefetch on D-pad focus.",
      "Shorter TV deferrals: catalogs, discovery shelves, live browse UI, and shelf loading start sooner.",
      "Back to Home: TV sub-nav prefetches the hub route on focus.",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-06-27",
    summary: "TV Live browse defaults and tighter North America region filtering.",
    highlights: [
      "TV Live: open straight into category shelves — Guide/List toggle removed on living-room TVs.",
      "Live TV search: fix keyboard dropping after one letter; category lists scroll while filtering.",
      "North America: hide Arabic, Latin American, and other foreign shelves unless that region is selected.",
      "Live API: stop falling back to unfiltered channels when regional sampling returns empty.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-06-26",
    summary: "VPS capacity monitoring — know when to upgrade your server.",
    highlights: [
      "Host metrics collector (RAM, CPU, disk, egress) runs every 5 minutes on the VPS.",
      "Protected GET /api/metrics — stream-proxy concurrency, Node memory, upgrade signals.",
      "npm run monitor:report — human-readable capacity summary to paste into support chats.",
      "One-time scripts/vps-monitoring-setup.sh installs cron, secret, and vps-spec.json.",
    ],
  },
  {
    version: "0.8.2",
    date: "2026-06-26",
    summary: "TV Live UI overhaul — readable 10-foot text, fixed category picker freeze.",
    highlights: [
      "Categories on TV: full-screen grid picker — no more page freeze from the old modal.",
      "Samsung / TV browsers: fix root font scale so text is readable at 100% zoom.",
      "TV Guide: taller rows, larger channel names and programme blocks.",
      "TV Live: bigger toolbar controls; hide Continue Watching when viewing the guide.",
    ],
  },
  {
    version: "0.8.1",
    date: "2026-06-26",
    summary: "Live TV layout fills wide screens — no more empty shelf gaps on TV.",
    highlights: [
      "Live TV: inline “+N more” after channel cards — fixes huge blank bands on 4K TVs.",
      "Live TV browse: up to 10 channels per shelf row with responsive card widths.",
      "TV Guide: taller programme grid on living-room browsers.",
      "TV Live page: tighter padding and compact header for more content area.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-06-26",
    summary: "TV discovery browse, cable-style live guide, and Balkan region filtering.",
    highlights: [
      "TV Movies/Series: restore discovery rows (Continue Watching, For You, Trending) on the landing view.",
      "TV Live TV: category shelf rows with now-playing EPG subtitles and a full TV Guide grid.",
      "TV browse: full-width poster grids and denser category tiles — less blank space on large TVs.",
      "Live TV: recognize |BLN|, |HRV|, |MKD| and Balkan country names so North America no longer shows European shelves.",
      "TV settings menu expands to four columns on wide screens.",
    ],
  },
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
      "TV browse: region chips with geo default, paginated categories, compact channel list.",
      "Fix saved playlists not restoring when Streamly session loads after cached IPTV creds.",
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
