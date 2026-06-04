/**
 * EPG "now playing" title cache — hot in-memory layer + IndexedDB persistence.
 * Avoids synchronous JSON.parse of huge localStorage blobs on Library first paint.
 */

import { EPG_CACHE_TTL_MS } from "@/lib/epg-constants";
import {
  idbForEachBatch,
  idbPutEntries,
  isIndexedDbAvailable,
  migrateLegacyLocalStorageEpg,
  type EpgCacheEntry,
} from "@/lib/epg-idb";

export { EPG_CACHE_TTL_MS } from "@/lib/epg-constants";
const FLUSH_MS = 800;
const MEMORY_MAX_KEYS = 5_000;
const IDB_HYDRATE_BATCH = 400;

type Store = Record<string, EpgCacheEntry>;

let memory: Store | null = null;
let diskHydrateStarted = false;
let hydratePromise: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const dirtyKeys = new Set<string>();

function cacheKey(server: string, username: string, streamId: number): string {
  return `${server}|${username}|${streamId}`;
}

function pruneExpired(store: Store, now = Date.now()): void {
  for (const k of Object.keys(store)) {
    if (now - store[k]!.at > EPG_CACHE_TTL_MS) delete store[k];
  }
}

function trimMemory(store: Store): void {
  const keys = Object.keys(store);
  if (keys.length <= MEMORY_MAX_KEYS) return;
  keys.sort((a, b) => store[a]!.at - store[b]!.at);
  const drop = keys.length - MEMORY_MAX_KEYS;
  for (let i = 0; i < drop; i++) delete store[keys[i]!];
}

function ensureMemory(): Store {
  if (!memory) {
    memory = {};
    scheduleDiskHydrate();
  }
  return memory;
}

async function hydrateFromDisk(): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  try {
    await migrateLegacyLocalStorageEpg();
    await idbForEachBatch(IDB_HYDRATE_BATCH, async (batch) => {
      if (!memory) memory = {};
      const now = Date.now();
      for (const [k, entry] of batch) {
        if (now - entry.at <= EPG_CACHE_TTL_MS) {
          memory[k] = entry;
        }
      }
      pruneExpired(memory, now);
      trimMemory(memory);
    });
  } catch {
    /* idb blocked / private mode */
  }
}

/** Hydrate memory from IndexedDB (and migrate legacy LS once) off the critical path. */
function scheduleDiskHydrate(): void {
  if (diskHydrateStarted || typeof window === "undefined") return;
  diskHydrateStarted = true;
  void whenEpgLocalCacheHydrated();
}

/**
 * Resolves once IndexedDB titles are merged into memory (or IDB is unavailable).
 * Await before server calls that need browser EPG hints.
 */
export function whenEpgLocalCacheHydrated(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  ensureMemory();
  if (!hydratePromise) {
    hydratePromise = hydrateFromDisk();
  }
  return hydratePromise;
}

function scheduleFlush(): void {
  if (typeof window === "undefined" || !isIndexedDbAvailable()) return;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!memory || dirtyKeys.size === 0) return;
    const batch: Array<[string, EpgCacheEntry]> = [];
    for (const k of dirtyKeys) {
      const row = memory[k];
      if (row) batch.push([k, row]);
    }
    dirtyKeys.clear();
    void idbPutEntries(batch).catch(() => {});
  }, FLUSH_MS);
}

function touchEntry(
  server: string,
  username: string,
  streamId: number,
  title: string
): void {
  const store = ensureMemory();
  const k = cacheKey(server, username, streamId);
  store[k] = { title, at: Date.now() };
  dirtyKeys.add(k);
  trimMemory(store);
  scheduleFlush();
}

/** Read a cached title from the hot memory layer (null until hydrated). */
export function getCachedEpgTitle(
  server: string,
  username: string,
  streamId: number
): string | null {
  const store = ensureMemory();
  const entry = store[cacheKey(server, username, streamId)];
  if (!entry) return null;
  if (Date.now() - entry.at > EPG_CACHE_TTL_MS) return null;
  return entry.title;
}

export function setCachedEpgTitle(
  server: string,
  username: string,
  streamId: number,
  title: string
): void {
  touchEntry(server, username, streamId, title);
}

export function setCachedEpgTitlesBatch(
  server: string,
  username: string,
  entries: Array<{ streamId: number; title: string }>
): void {
  if (!entries.length) return;
  const store = ensureMemory();
  const now = Date.now();
  for (const { streamId, title } of entries) {
    const k = cacheKey(server, username, streamId);
    store[k] = { title, at: now };
    dirtyKeys.add(k);
  }
  pruneExpired(store, now);
  trimMemory(store);
  scheduleFlush();
}

export function getBulkCachedEpgTitles(
  server: string,
  username: string,
  streamIds: number[]
): Map<number, string> {
  const store = ensureMemory();
  const now = Date.now();
  const result = new Map<number, string>();
  for (const id of streamIds) {
    const entry = store[cacheKey(server, username, id)];
    if (entry && now - entry.at <= EPG_CACHE_TTL_MS) {
      result.set(id, entry.title);
    }
  }
  return result;
}

export function getCachedEpgKnownIds(
  server: string,
  username: string,
  streamIds: number[]
): Set<number> {
  const store = ensureMemory();
  const now = Date.now();
  const known = new Set<number>();
  for (const id of streamIds) {
    const entry = store[cacheKey(server, username, id)];
    if (entry && now - entry.at <= EPG_CACHE_TTL_MS) known.add(id);
  }
  return known;
}

/** Recent browser EPG titles for this account (for server trending merge). */
export function countCachedEpgTitlesForAccount(
  server: string,
  username: string
): number {
  const store = ensureMemory();
  const prefix = `${server}|${username}|`;
  const now = Date.now();
  let count = 0;
  for (const [k, entry] of Object.entries(store)) {
    if (!k.startsWith(prefix)) continue;
    if (now - entry.at > EPG_CACHE_TTL_MS) continue;
    count++;
  }
  return count;
}

export function listCachedEpgTitlesForAccount(
  server: string,
  username: string,
  maxEntries = 600
): Array<{ streamId: number; title: string }> {
  const store = ensureMemory();
  const prefix = `${server}|${username}|`;
  const now = Date.now();
  const rows: Array<{ streamId: number; title: string; at: number }> = [];

  for (const [k, entry] of Object.entries(store)) {
    if (!k.startsWith(prefix)) continue;
    if (now - entry.at > EPG_CACHE_TTL_MS) continue;
    const streamId = Number(k.slice(prefix.length));
    if (!Number.isFinite(streamId) || streamId <= 0) continue;
    rows.push({ streamId, title: entry.title, at: entry.at });
  }

  rows.sort((a, b) => b.at - a.at);
  return rows
    .slice(0, maxEntries)
    .map(({ streamId, title }) => ({ streamId, title }));
}
