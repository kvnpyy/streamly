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
 * Trending-on-TV shelf API result (server memory, hint-less requests only).
 * Aligns with EPG block length; TMDB weekly signal does not need minute-level refresh.
 */
export const TRENDING_ON_TV_RESPONSE_TTL_MS = 4 * HOUR_MS;
