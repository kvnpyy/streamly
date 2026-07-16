/**
 * Standard short-EPG row count for "now playing" lookups.
 * Use this in React Query keys so discovery, browse, search, and tiles dedupe.
 */
export const SHORT_EPG_NOW_PLAYING_LIMIT = 2;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Per-channel "now playing" title (browser IndexedDB + server title cache).
 * Most guide slots run 30 minutes to several hours; 4h avoids refetching
 * the same block all day while still refreshing across dayparts.
 */
export const EPG_CACHE_TTL_MS = 4 * HOUR_MS;

/**
 * Trending-on-TV shelf API result (server in-memory response cache).
 * Served for the account+region even when the client sends EPG hints — hints
 * only improve the next rebuild, they must not bypass a warm shelf.
 */
export const TRENDING_ON_TV_RESPONSE_TTL_MS = 4 * HOUR_MS;

/** Cold Live page: max wait for shelf EPG hints before the first trending request. */
export const TRENDING_ON_TV_SHELF_HINT_WAIT_MS = 400;
