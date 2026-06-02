/** Opt-in flags — background EPG is off by default so the UI stays responsive. */

function envEnabled(name: string): boolean {
  const v = process.env[name]?.trim();
  return v === "1" || v === "true";
}

/** Network short-EPG for home/live discovery "On now" shelves. */
export function isLiveDiscoveryEpgNetworkEnabled(): boolean {
  return envEnabled("NEXT_PUBLIC_LIVE_DISCOVERY_EPG");
}

/** Network short-EPG for browse shelf subtitles. */
export function isLiveShelfEpgEnabled(): boolean {
  return envEnabled("NEXT_PUBLIC_LIVE_SHELF_EPG");
}

/** Network short-EPG scan for programme-title live search. */
export function isLiveProgrammeSearchEnabled(): boolean {
  return envEnabled("NEXT_PUBLIC_LIVE_PROGRAMME_SEARCH");
}

/** Per-tile provider EPG on virtualized live lists. */
export function isLiveTileEpgEnabled(): boolean {
  return envEnabled("NEXT_PUBLIC_LIVE_TILE_EPG");
}

/** Max network EPG fetches for discovery when enabled (priority channels only). */
export const LIVE_DISCOVERY_NETWORK_CAP = 10;

/** On-air / sports discovery rows on the Live TV page (heavy — off by default). */
export function isLivePageDiscoveryEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_LIVE_PAGE_DISCOVERY?.trim();
  return v === "1" || v === "true";
}

/** Per-row EPG in the programme guide (very heavy — off by default). */
export function isLiveGuideEpgEnabled(): boolean {
  return envEnabled("NEXT_PUBLIC_LIVE_GUIDE_EPG");
}
