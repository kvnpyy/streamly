import { createHash } from "node:crypto";
import { isXtreamCatalogCacheAction } from "@/lib/xtream-catalog-cache";
import { XTREAM_CATALOG_CACHE_MAX_AGE_SEC } from "@/lib/xtream-catalog-cache";
import { isXtreamEpgAction } from "@/lib/xtream-epg-actions";

type Entry = { body: string; expiresAt: number };

const store = new Map<string, Entry>();
const MAX_ENTRIES = 96;
/** Skip caching huge upstream bodies (protect VPS RAM). */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const EPG_TTL_MS = Math.max(
  30_000,
  Math.min(
    300_000,
    parseInt(process.env.XTREAM_EPG_CACHE_TTL_SEC || "90", 10) * 1000 || 90_000
  )
);

const CATALOG_TTL_MS =
  Math.max(
    60,
    parseInt(process.env.XTREAM_UPSTREAM_CACHE_TTL_SEC || "", 10) ||
      XTREAM_CATALOG_CACHE_MAX_AGE_SEC
  ) * 1000;

export function xtreamUpstreamCacheKey(
  creds: { server: string; username: string; password: string },
  params: Record<string, string>
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const raw = `${creds.server}\x1f${creds.username}\x1f${creds.password}\x1f${sorted}`;
  return createHash("sha256").update(raw).digest("hex");
}

function ttlForAction(action: string | null): number | null {
  if (action && isXtreamCatalogCacheAction(action)) return CATALOG_TTL_MS;
  if (action && isXtreamEpgAction(action)) return EPG_TTL_MS;
  return null;
}

export function getXtreamUpstreamCached(key: string, nowMs = Date.now()): string | null {
  const hit = store.get(key);
  if (!hit || hit.expiresAt <= nowMs) {
    if (hit) store.delete(key);
    return null;
  }
  return hit.body;
}

export function setXtreamUpstreamCached(
  key: string,
  body: string,
  action: string | null,
  nowMs = Date.now()
): void {
  const ttl = ttlForAction(action);
  if (ttl == null) return;
  if (body.length > MAX_BODY_BYTES) return;

  if (store.size >= MAX_ENTRIES) {
    for (const [k, v] of store) {
      if (v.expiresAt <= nowMs) store.delete(k);
    }
    if (store.size >= MAX_ENTRIES) {
      const first = store.keys().next().value;
      if (first) store.delete(first);
    }
  }
  store.set(key, { body, expiresAt: nowMs + ttl });
}

export function clearXtreamUpstreamCache(): void {
  store.clear();
}
