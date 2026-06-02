import { isCoarsePointerLargeScreen } from "@/lib/living-room-detect";
import {
  isAmazonSilkUserAgent,
  isTvClassUserAgent,
} from "@/lib/tv-user-agent";

/** True for TV UA, Silk, or couch browsing (coarse pointer on a large screen). */
export function isLivingRoomPlaybackClient(ua?: string): boolean {
  if (typeof navigator === "undefined" && !ua) return false;
  const u = ua ?? navigator.userAgent ?? "";
  return (
    isTvClassUserAgent(u) ||
    isAmazonSilkUserAgent(u) ||
    isCoarsePointerLargeScreen()
  );
}

/** Longer debounce on TV remotes — reduces rapid HLS teardown/rebuild while zapping. */
export function liveChannelFlipDebounceMs(ua?: string): number {
  return isLivingRoomPlaybackClient(ua) ? 520 : 280;
}

/** Cap discovery EPG scans on home — keep proxy/panel load bounded. */
export function tvDiscoveryEpgMaxScan(ua?: string): number {
  return isLivingRoomPlaybackClient(ua) ? 24 : 36;
}

/** Brief defer so the hub paints one frame before EPG (not multi-second). */
export function tvHomeDiscoveryDeferMs(ua?: string): number {
  return isLivingRoomPlaybackClient(ua) ? 350 : 0;
}

/** Channels to scan first for on-now before the slower background pass. */
export function tvDiscoveryFastScanCount(ua?: string): number {
  return isLivingRoomPlaybackClient(ua) ? 16 : 32;
}

/** Lower bar so TV home shows discovery rows without scrolling past hub tiles. */
export function tvLiveDiscoveryMinItems(): number {
  return 1;
}

export function tvSportsShelfMinItems(): number {
  return 2;
}

export function tvRegionalTrendingMinItems(): number {
  return 2;
}

/** Low concurrency on TV — parallel EPG calls overwhelm the proxy and panel. */
export function tvDiscoveryEpgConcurrency(ua?: string): number {
  return isLivingRoomPlaybackClient(ua) ? 2 : 12;
}

/** Programme-title search on Live TV — keep scans small so typing stays responsive. */
export function tvLiveSearchMaxScanChannels(ua?: string): number {
  return isLivingRoomPlaybackClient(ua) ? 48 : 120;
}

export function tvLiveSearchEpgConcurrency(ua?: string): number {
  return isLivingRoomPlaybackClient(ua) ? 2 : 4;
}

/** Avoid programme EPG scans until the query is specific enough. */
export function tvLiveSearchMinQueryLength(ua?: string): number {
  void ua;
  return 2;
}

/** Extra pause after typing before programme-title EPG scans (channel names filter instantly). */
export function tvLiveSearchProgrammeDeferMs(ua?: string): number {
  return isLivingRoomPlaybackClient(ua) ? 400 : 550;
}

/** Wait before discovery EPG on Live TV page so the grid can paint. */
export function tvLivePageDiscoveryDeferMs(ua?: string): number {
  return isLivingRoomPlaybackClient(ua) ? 8_000 : 0;
}

/** Defer full movie/series catalog on TV home so live + discovery paint first. */
export function tvHomeCatalogDeferMs(ua?: string): number {
  return isLivingRoomPlaybackClient(ua) ? 8_000 : 0;
}

/** @deprecated Use tvHomeCatalogDeferMs — kept for callers migrating gradually. */
export function tvHomeVodDeferMs(ua?: string): number {
  return tvHomeCatalogDeferMs(ua);
}

export function tvHomeSeriesDeferMs(ua?: string): number {
  return tvHomeCatalogDeferMs(ua);
}
