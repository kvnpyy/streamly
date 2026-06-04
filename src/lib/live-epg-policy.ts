/** Heavy discovery scans stay opt-in; tile/shelf EPG defaults on (cache-first). */

function envEnabled(name: string): boolean {
  const v = process.env[name]?.trim();
  return v === "1" || v === "true";
}

function envDisabled(name: string): boolean {
  const v = process.env[name]?.trim();
  return v === "0" || v === "false";
}

/** Default-on unless explicitly set to 0/false. */
function envDefaultOn(name: string): boolean {
  if (envDisabled(name)) return false;
  if (envEnabled(name)) return true;
  return true;
}

/** Network short-EPG for home/live discovery "On now" shelves. */
export function isLiveDiscoveryEpgNetworkEnabled(): boolean {
  return envEnabled("NEXT_PUBLIC_LIVE_DISCOVERY_EPG");
}

/** Network short-EPG for browse shelf subtitles (default on). */
export function isLiveShelfEpgEnabled(): boolean {
  return envDefaultOn("NEXT_PUBLIC_LIVE_SHELF_EPG");
}

/** Network short-EPG scan for programme-title live search. */
export function isLiveProgrammeSearchEnabled(): boolean {
  return envEnabled("NEXT_PUBLIC_LIVE_PROGRAMME_SEARCH");
}

/** Per-tile provider EPG on virtualized live lists (default on; in-view only). */
export function isLiveTileEpgEnabled(): boolean {
  return envDefaultOn("NEXT_PUBLIC_LIVE_TILE_EPG");
}

/** Max network EPG fetches for discovery when enabled (priority channels only). */
export const LIVE_DISCOVERY_NETWORK_CAP = 10;

/** Slightly larger cap for the Trending on TV shelf scan. */
export const LIVE_TRENDING_NETWORK_CAP = 24;

/** Client network EPG for Trending on TV (off — shelf uses /api/discovery/trending-on-tv). */
export function isLiveTrendingEpgNetworkEnabled(): boolean {
  return envEnabled("NEXT_PUBLIC_LIVE_TRENDING_EPG");
}

/** On-air / sports discovery rows on the Live TV page (heavy — off by default). */
export function isLivePageDiscoveryEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_LIVE_PAGE_DISCOVERY?.trim();
  return v === "1" || v === "true";
}

function discoveryShelvesOn(): boolean {
  const v = process.env.NEXT_PUBLIC_DISCOVERY_SHELVES?.trim();
  return v !== "0" && v !== "false";
}

/**
 * "Trending on TV" shelf (EPG title → TMDB interest). On by default when discovery
 * shelves are enabled; set NEXT_PUBLIC_LIVE_TRENDING_SHELF=0 to disable.
 */
export function isLiveTrendingShelfEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_LIVE_TRENDING_SHELF?.trim();
  if (v === "0" || v === "false") return false;
  if (v === "1" || v === "true") return true;
  return discoveryShelvesOn();
}

/** Per-row EPG in the programme guide (very heavy — off by default). */
export function isLiveGuideEpgEnabled(): boolean {
  return envEnabled("NEXT_PUBLIC_LIVE_GUIDE_EPG");
}
