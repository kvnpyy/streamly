import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Category, LiveStream } from "@/lib/xtream-types";
import { XTREAM_CATALOG_CACHE_MAX_AGE_SEC } from "@/lib/xtream-catalog-cache";

export type LiveCatalogBundle = {
  categories: Category[];
  streams: LiveStream[];
  countByCategoryId?: Record<string, number>;
  streamIdsByCategory?: Record<string, number[]>;
};

type DiskEnvelope = {
  expiresAt: number;
  bundle: LiveCatalogBundle;
};

function cacheRoot(): string {
  const root =
    process.env.XTREAM_CACHE_DIR?.trim() ||
    path.join(process.cwd(), ".cache", "xtream-catalog");
  return root;
}

export function liveCatalogDiskKey(creds: {
  server: string;
  username: string;
  password: string;
}): string {
  return createHash("sha256")
    .update(`${creds.server}\x1f${creds.username}\x1f${creds.password}`)
    .digest("hex");
}

function filePath(key: string): string {
  return path.join(cacheRoot(), `${key}.json`);
}

export async function readLiveCatalogDisk(
  key: string,
  nowMs = Date.now()
): Promise<LiveCatalogBundle | null> {
  try {
    const raw = await readFile(filePath(key), "utf8");
    const env = JSON.parse(raw) as DiskEnvelope;
    if (!env?.bundle || typeof env.expiresAt !== "number") return null;
    if (env.expiresAt <= nowMs) return null;
    if (!Array.isArray(env.bundle.categories) || !Array.isArray(env.bundle.streams)) {
      return null;
    }
    return env.bundle;
  } catch {
    return null;
  }
}

export async function writeLiveCatalogDisk(
  key: string,
  bundle: LiveCatalogBundle,
  ttlSec = XTREAM_CATALOG_CACHE_MAX_AGE_SEC,
  nowMs = Date.now()
): Promise<void> {
  await writeCatalogDisk(key, bundle, ttlSec, nowMs);
}

type GenericEnvelope<T> = { expiresAt: number; bundle: T };

export function catalogDiskKey(
  kind: "live" | "vod" | "series",
  creds: { server: string; username: string; password: string }
): string {
  return `${kind}-${liveCatalogDiskKey(creds)}`;
}

export async function readCatalogDisk<T>(
  key: string,
  nowMs = Date.now()
): Promise<T | null> {
  try {
    const raw = await readFile(filePath(key), "utf8");
    const env = JSON.parse(raw) as GenericEnvelope<T>;
    if (!env?.bundle || typeof env.expiresAt !== "number") return null;
    if (env.expiresAt <= nowMs) return null;
    return env.bundle;
  } catch {
    return null;
  }
}

export async function writeCatalogDisk<T>(
  key: string,
  bundle: T,
  ttlSec = XTREAM_CATALOG_CACHE_MAX_AGE_SEC,
  nowMs = Date.now()
): Promise<void> {
  const dir = cacheRoot();
  await mkdir(dir, { recursive: true });
  const envelope: GenericEnvelope<T> = {
    expiresAt: nowMs + Math.max(60, ttlSec) * 1000,
    bundle,
  };
  await writeFile(filePath(key), JSON.stringify(envelope), "utf8");
}
