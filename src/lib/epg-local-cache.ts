/**
 * Tiny localStorage-backed cache for EPG "now playing" titles.
 *
 * Why this exists:
 * - TanStack Query's cache is in-memory only; it's wiped on page refresh.
 * - The `TvCategoryView` localEpg state is also wiped every time the overlay
 *   is closed and re-opened.
 * - EPG API calls (both provider shortEPG and external iptv-org) are slow
 *   enough (~0.5–2 s each) that re-running them every time the overlay opens
 *   creates a noticeable blank period.
 *
 * This module stores { title, fetchedAt } for each stream_id, keyed by
 * `server:username:streamId` so different providers don't pollute each other.
 * Entries expire after TTL_MS (30 min, matching SHORT_EPG_STALE_MS).
 *
 * Storage estimate: ~60 bytes per channel. 2 000 channels ≈ 120 KB —
 * well within the typical 5 MB localStorage quota.
 */

const LS_KEY = "iptv_epg_cache_v1";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

type Entry = { title: string; at: number };
type Store = Record<string, Entry>;

function load(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function save(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded or private browsing — ignore silently.
  }
}

function key(server: string, username: string, streamId: number): string {
  return `${server}|${username}|${streamId}`;
}

/** Read a cached title. Returns `null` if absent or expired. */
export function getCachedEpgTitle(
  server: string,
  username: string,
  streamId: number
): string | null {
  const entry = load()[key(server, username, streamId)];
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.title;
}

/** Write a title into the cache and prune any expired entries. */
export function setCachedEpgTitle(
  server: string,
  username: string,
  streamId: number,
  title: string
): void {
  const store = load();
  store[key(server, username, streamId)] = { title, at: Date.now() };

  // Prune expired entries so localStorage doesn't grow unboundedly.
  const now = Date.now();
  for (const k of Object.keys(store)) {
    if (now - store[k]!.at > TTL_MS) delete store[k];
  }
  save(store);
}

/**
 * Bulk-read: returns a Map<streamId, title> for all supplied streamIds
 * that are present and non-expired. Useful to pre-populate the localEpg
 * map on overlay open without any API calls.
 */
export function getBulkCachedEpgTitles(
  server: string,
  username: string,
  streamIds: number[]
): Map<number, string> {
  const store = load();
  const now = Date.now();
  const result = new Map<number, string>();
  for (const id of streamIds) {
    const entry = store[key(server, username, id)];
    if (entry && now - entry.at <= TTL_MS) {
      result.set(id, entry.title);
    }
  }
  return result;
}
