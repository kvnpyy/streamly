/**
 * Per-key IndexedDB store for EPG titles — avoids parsing one giant localStorage JSON blob.
 */

export type EpgCacheEntry = { title: string; at: number };

const DB_NAME = "iptv_epg_cache_v2";
const STORE = "epg";
const DB_VERSION = 1;
const MIGRATED_FLAG = "iptv_epg_migrated_v2";
const LEGACY_LS_KEY = "iptv_epg_cache_v1";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("idb open failed"));
    });
  }
  return dbPromise;
}

export async function idbPutEntries(
  entries: Array<[string, EpgCacheEntry]>
): Promise<void> {
  if (!entries.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    for (const [k, v] of entries) os.put(v, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb put failed"));
  });
}

export async function idbForEachBatch(
  batchSize: number,
  onBatch: (batch: Array<[string, EpgCacheEntry]>) => void | Promise<void>
): Promise<void> {
  const db = await openDb();
  /** Cursor iteration must stay synchronous — awaiting inside `onsuccess` ends the tx. */
  const batches: Array<Array<[string, EpgCacheEntry]>> = [];

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const os = tx.objectStore(STORE);
    const req = os.openCursor();
    let batch: Array<[string, EpgCacheEntry]> = [];

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        if (batch.length) batches.push(batch);
        resolve();
        return;
      }
      const value = cursor.value as EpgCacheEntry;
      if (value?.title && typeof value.at === "number") {
        batch.push([String(cursor.key), value]);
      }
      if (batch.length >= batchSize) {
        batches.push(batch);
        batch = [];
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("idb cursor failed"));
    tx.onerror = () => reject(tx.error ?? new Error("idb tx failed"));
  });

  const { yieldToMain } = await import("@/lib/yield-to-main");
  for (const chunk of batches) {
    await onBatch(chunk);
    await yieldToMain();
  }
}

/** One-time migration from legacy localStorage blob → IndexedDB keys. */
export async function migrateLegacyLocalStorageEpg(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATED_FLAG) === "1") return;

  let legacy: Record<string, EpgCacheEntry> = {};
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (raw) legacy = JSON.parse(raw) as Record<string, EpgCacheEntry>;
  } catch {
    legacy = {};
  }

  const pairs = Object.entries(legacy);
  const { yieldToMain } = await import("@/lib/yield-to-main");

  for (let i = 0; i < pairs.length; i += 250) {
    await idbPutEntries(pairs.slice(i, i + 250));
    await yieldToMain();
  }

  try {
    localStorage.removeItem(LEGACY_LS_KEY);
    localStorage.setItem(MIGRATED_FLAG, "1");
  } catch {
    /* private mode */
  }
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
