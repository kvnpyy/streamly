import { favoriteKey } from "@/lib/favorites-sync";
import { parsePositiveRouteId, safeStr } from "@/lib/utils";
import type { RecentItem } from "@/store/preferences";

export const RECENTS_MAX = 50;
export const VOD_RESUME_KEYS_MAX = 220;
export const VOD_RESUME_SEC_MAX = 86400;

/** Union local + remote; newer `lastAt` wins. */
export function mergeRecents(
  local: RecentItem[],
  remote: RecentItem[]
): RecentItem[] {
  const map = new Map<string, RecentItem>();
  for (const r of [...remote, ...local]) {
    const k = favoriteKey(r);
    const existing = map.get(k);
    if (!existing || r.lastAt >= existing.lastAt) {
      map.set(k, {
        ...r,
        addedAt: Math.max(existing?.addedAt ?? 0, r.addedAt ?? 0) || Date.now(),
        lastAt: Math.max(existing?.lastAt ?? 0, r.lastAt ?? 0) || Date.now(),
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, RECENTS_MAX);
}

export function sanitizeRecents(raw: unknown): RecentItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kind = o.kind;
    const id =
      typeof o.id === "number"
        ? o.id
        : typeof o.id === "string"
          ? parsePositiveRouteId(o.id)
          : null;
    const name = safeStr(o.name);
    if (kind !== "live" && kind !== "movie" && kind !== "series") continue;
    if (id == null || !Number.isFinite(id) || id <= 0) continue;
    if (!name.trim()) continue;
    const icon = typeof o.icon === "string" ? o.icon.slice(0, 2048) : undefined;
    const addedAt =
      typeof o.addedAt === "number" && Number.isFinite(o.addedAt)
        ? o.addedAt
        : Date.now();
    const lastAt =
      typeof o.lastAt === "number" && Number.isFinite(o.lastAt)
        ? o.lastAt
        : addedAt;
    const meta =
      o.meta && typeof o.meta === "object" && !Array.isArray(o.meta)
        ? (o.meta as Record<string, string | number | undefined>)
        : undefined;
    out.push({
      kind,
      id,
      name: name.trim().slice(0, 512),
      icon,
      meta,
      addedAt,
      lastAt,
    });
    if (out.length >= RECENTS_MAX) break;
  }
  return out;
}

export function sanitizeVodResumeSec(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length > 256) continue;
    if (typeof val !== "number" || !Number.isFinite(val) || val < 12) continue;
    out[key] = Math.min(val, VOD_RESUME_SEC_MAX);
    if (Object.keys(out).length >= VOD_RESUME_KEYS_MAX) break;
  }
  return out;
}

/** Per-title resume: keep the furthest position across devices. */
export function mergeVodResumeSec(
  local: Record<string, number>,
  remote: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = { ...remote };
  for (const [key, sec] of Object.entries(local)) {
    const prev = out[key];
    if (prev == null || sec > prev) out[key] = sec;
  }
  const keys = Object.keys(out);
  if (keys.length <= VOD_RESUME_KEYS_MAX) return out;
  const trimmed: Record<string, number> = {};
  for (const k of keys.slice(0, VOD_RESUME_KEYS_MAX)) {
    trimmed[k] = out[k]!;
  }
  return trimmed;
}
