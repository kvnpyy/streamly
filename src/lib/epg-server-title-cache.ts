import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { EPG_CACHE_TTL_MS } from "@/lib/epg-constants";
import type { XtreamCredentials } from "@/lib/xtream-types";

type EpgCacheEntry = { title: string; at: number };

type DiskFile = {
  v: 1;
  entries: Record<string, EpgCacheEntry>;
};

const MEMORY_MAX_KEYS = 8_000;
const memory = new Map<string, EpgCacheEntry>();
const hydratedAccounts = new Set<string>();
const dirtyAccounts = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function cacheRoot(): string {
  return (
    process.env.XTREAM_EPG_CACHE_DIR?.trim() ||
    path.join(process.cwd(), ".cache", "epg-titles")
  );
}

export function serverEpgAccountKey(creds: XtreamCredentials): string {
  return createHash("sha256")
    .update(`${creds.server}\x1f${creds.username}\x1f${creds.password}`)
    .digest("hex");
}

function memKey(accountKey: string, streamId: number): string {
  return `${accountKey}|${streamId}`;
}

function diskPath(accountKey: string): string {
  return path.join(cacheRoot(), `${accountKey}.json`);
}

function pruneMemory(now = Date.now()): void {
  for (const [k, entry] of memory) {
    if (now - entry.at > EPG_CACHE_TTL_MS) memory.delete(k);
  }
  if (memory.size <= MEMORY_MAX_KEYS) return;
  const sorted = [...memory.entries()].sort((a, b) => a[1].at - b[1].at);
  const drop = sorted.length - MEMORY_MAX_KEYS;
  for (let i = 0; i < drop; i++) memory.delete(sorted[i]![0]);
}

export async function hydrateServerEpgCache(
  creds: XtreamCredentials
): Promise<void> {
  const accountKey = serverEpgAccountKey(creds);
  if (hydratedAccounts.has(accountKey)) return;
  hydratedAccounts.add(accountKey);

  try {
    const raw = await readFile(diskPath(accountKey), "utf8");
    const file = JSON.parse(raw) as DiskFile;
    if (!file?.entries || typeof file.entries !== "object") return;
    const now = Date.now();
    for (const [streamId, entry] of Object.entries(file.entries)) {
      if (!entry?.title || typeof entry.at !== "number") continue;
      if (now - entry.at > EPG_CACHE_TTL_MS) continue;
      memory.set(memKey(accountKey, Number(streamId)), {
        title: entry.title,
        at: entry.at,
      });
    }
    pruneMemory(now);
  } catch {
    /* cold start */
  }
}

function scheduleFlush(accountKey: string): void {
  dirtyAccounts.add(accountKey);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const keys = [...dirtyAccounts];
    dirtyAccounts.clear();
    for (const k of keys) void flushAccountToDisk(k).catch(() => {});
  }, 1_200);
}

async function flushAccountToDisk(accountKey: string): Promise<void> {
  const now = Date.now();
  const entries: Record<string, EpgCacheEntry> = {};
  const prefix = `${accountKey}|`;
  for (const [k, entry] of memory) {
    if (!k.startsWith(prefix)) continue;
    if (now - entry.at > EPG_CACHE_TTL_MS) continue;
    entries[k.slice(prefix.length)] = entry;
  }
  const dir = cacheRoot();
  await mkdir(dir, { recursive: true });
  const payload: DiskFile = { v: 1, entries };
  await writeFile(diskPath(accountKey), JSON.stringify(payload), "utf8");
}

export function getServerEpgTitle(
  creds: XtreamCredentials,
  streamId: number
): string | undefined {
  const accountKey = serverEpgAccountKey(creds);
  const entry = memory.get(memKey(accountKey, streamId));
  if (!entry) return undefined;
  if (Date.now() - entry.at > EPG_CACHE_TTL_MS) {
    memory.delete(memKey(accountKey, streamId));
    return undefined;
  }
  return entry.title;
}

export function getBulkServerEpgTitles(
  creds: XtreamCredentials,
  streamIds: number[]
): Map<number, string> {
  const accountKey = serverEpgAccountKey(creds);
  const now = Date.now();
  const out = new Map<number, string>();
  for (const streamId of streamIds) {
    const entry = memory.get(memKey(accountKey, streamId));
    if (entry && now - entry.at <= EPG_CACHE_TTL_MS) {
      out.set(streamId, entry.title);
    }
  }
  return out;
}

export function setServerEpgTitle(
  creds: XtreamCredentials,
  streamId: number,
  title: string
): void {
  const trimmed = title.trim();
  if (!trimmed) return;
  const accountKey = serverEpgAccountKey(creds);
  memory.set(memKey(accountKey, streamId), { title: trimmed, at: Date.now() });
  pruneMemory();
  scheduleFlush(accountKey);
}

export function setServerEpgTitlesBatch(
  creds: XtreamCredentials,
  rows: Array<{ streamId: number; title: string }>
): void {
  if (!rows.length) return;
  const accountKey = serverEpgAccountKey(creds);
  const now = Date.now();
  for (const { streamId, title } of rows) {
    const trimmed = title.trim();
    if (!trimmed) continue;
    memory.set(memKey(accountKey, streamId), { title: trimmed, at: now });
  }
  pruneMemory(now);
  scheduleFlush(accountKey);
}
