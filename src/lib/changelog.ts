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
