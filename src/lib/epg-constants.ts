/**
 * Standard short-EPG row count for "now playing" lookups.
 * Use this in React Query keys so discovery, browse, search, and tiles dedupe.
 */
export const SHORT_EPG_NOW_PLAYING_LIMIT = 2;

/** Shared TTL for browser IndexedDB and VPS EPG title caches. */
export const EPG_CACHE_TTL_MS = 30 * 60 * 1000;
