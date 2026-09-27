import { favoriteKey } from "@/lib/favorites-sync";
import { parsePositiveRouteId, safeStr } from "@/lib/utils";
import type { RecentItem } from "@/store/preferences";

export const RECENTS_MAX = 50;
/** Account-wide history: a few long-running series plus movies. */
export const VOD_RESUME_KEYS_MAX = 2000;
export const VOD_RESUME_SEC_MAX = 86400;
/**
 * Manual mark-watched when the provider sent no runtime.
 * Must match `MANUAL_WATCHED_RESUME_SEC` in player-vod-resume.ts.
 */
export const VOD_RESUME_WATCHED_SENTINEL = 1_000_000;
const VOD_RESUME_KEY_MAX_LEN = 512;

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

export type VodResumeSnapshot = {
  sec: Record<string, number>;
  /** Epoch ms of the last explicit write. A key with a timestamp and no seconds was unmarked. */
  writeAt: Record<string, number>;
};

function resumeEntries(raw: unknown): [string, unknown][] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length <= 10_000) return entries;
  return entries.slice(entries.length - 10_000);
}

export function sanitizeVodResumeSec(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, val] of resumeEntries(raw)) {
    if (key.length === 0 || key.length > VOD_RESUME_KEY_MAX_LEN) continue;
    if (typeof val !== "number" || !Number.isFinite(val) || val < 12) continue;
    out[key] =
      val >= VOD_RESUME_WATCHED_SENTINEL
        ? VOD_RESUME_WATCHED_SENTINEL
        : Math.min(val, VOD_RESUME_SEC_MAX);
  }
  return out;
}

export function sanitizeVodResumeWriteAt(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const maxAt = Date.now() + 86_400_000;
  for (const [key, val] of resumeEntries(raw)) {
    if (key.length === 0 || key.length > VOD_RESUME_KEY_MAX_LEN) continue;
    if (typeof val !== "number" || !Number.isFinite(val) || val <= 0 || val > maxAt) {
      continue;
    }
    out[key] = Math.floor(val);
  }
  return out;
}

function isPinnedResumeSec(sec: number | undefined): boolean {
  return sec != null && sec >= VOD_RESUME_SEC_MAX;
}

/** Drop the oldest in-progress rows first so a newly finished episode is kept. */
export function trimVodResumeSnapshot(
  snapshot: VodResumeSnapshot
): VodResumeSnapshot {
  const sec = sanitizeVodResumeSec(snapshot.sec);
  const writeAt = sanitizeVodResumeWriteAt(snapshot.writeAt);
  const keys = [
    ...new Set([...Object.keys(sec), ...Object.keys(writeAt)]),
  ];
  if (keys.length <= VOD_RESUME_KEYS_MAX) return { sec, writeAt };

  const ranked = [...keys].sort((a, b) => {
    const pinA = isPinnedResumeSec(sec[a]) ? 1 : 0;
    const pinB = isPinnedResumeSec(sec[b]) ? 1 : 0;
    if (pinA !== pinB) return pinA - pinB;
    const atA = writeAt[a] ?? 0;
    const atB = writeAt[b] ?? 0;
    if (atA !== atB) return atA - atB;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const drop = new Set(ranked.slice(0, keys.length - VOD_RESUME_KEYS_MAX));
  const nextSec: Record<string, number> = {};
  const nextAt: Record<string, number> = {};
  for (const key of keys) {
    if (drop.has(key)) continue;
    if (sec[key] != null) nextSec[key] = sec[key]!;
    if (writeAt[key] != null) nextAt[key] = writeAt[key]!;
  }
  return { sec: nextSec, writeAt: nextAt };
}

function usableResumeSec(sec: number | undefined): number | undefined {
  if (sec == null || !Number.isFinite(sec) || sec < 12) return undefined;
  return sec >= VOD_RESUME_WATCHED_SENTINEL
    ? VOD_RESUME_WATCHED_SENTINEL
    : Math.min(sec, VOD_RESUME_SEC_MAX);
}

/**
 * Furthest playback position wins, so a stale device cannot rewind a title.
 * An explicit unwatch (timestamp, no seconds) wins when it is newer than the
 * saved position — including legacy rows that never stored a timestamp.
 */
export function mergeVodResumeSnapshots(
  local: VodResumeSnapshot,
  remote: VodResumeSnapshot
): VodResumeSnapshot {
  const localSec = sanitizeVodResumeSec(local.sec);
  const remoteSec = sanitizeVodResumeSec(remote.sec);
  const localAt = sanitizeVodResumeWriteAt(local.writeAt);
  const remoteAt = sanitizeVodResumeWriteAt(remote.writeAt);
  const keys = new Set([
    ...Object.keys(localSec),
    ...Object.keys(remoteSec),
    ...Object.keys(localAt),
    ...Object.keys(remoteAt),
  ]);
  const sec: Record<string, number> = {};
  const writeAt: Record<string, number> = {};

  for (const key of keys) {
    const lSec = usableResumeSec(localSec[key]);
    const rSec = usableResumeSec(remoteSec[key]);
    const lAt = localAt[key] ?? 0;
    const rAt = remoteAt[key] ?? 0;
    const localClear = lSec == null && lAt > 0;
    const remoteClear = rSec == null && rAt > 0;

    if (localClear || remoteClear) {
      const clearAt = Math.max(localClear ? lAt : 0, remoteClear ? rAt : 0);
      if (lSec != null && lAt > clearAt) {
        sec[key] = lSec;
        writeAt[key] = lAt;
        continue;
      }
      if (rSec != null && rAt > clearAt) {
        sec[key] = rSec;
        writeAt[key] = rAt;
        continue;
      }
      const positionAt = Math.max(lSec != null ? lAt : 0, rSec != null ? rAt : 0);
      if (clearAt > 0 && clearAt >= positionAt) {
        writeAt[key] = clearAt;
        continue;
      }
    }

    const chosen = Math.max(lSec ?? 0, rSec ?? 0);
    if (chosen < 12) continue;
    sec[key] = chosen;
    const at = Math.max(lAt, rAt);
    if (at > 0) writeAt[key] = at;
  }

  return trimVodResumeSnapshot({ sec, writeAt });
}

/** Per-title resume: keep the furthest position across devices. */
export function mergeVodResumeSec(
  local: Record<string, number>,
  remote: Record<string, number>
): Record<string, number> {
  return mergeVodResumeSnapshots(
    { sec: local, writeAt: {} },
    { sec: remote, writeAt: {} }
  ).sec;
}

export function vodResumeSnapshotsEqual(
  a: VodResumeSnapshot,
  b: VodResumeSnapshot
): boolean {
  const aKeys = Object.keys(a.sec);
  const bKeys = Object.keys(b.sec);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a.sec[key] !== b.sec[key]) return false;
  }
  const aAt = Object.keys(a.writeAt);
  const bAt = Object.keys(b.writeAt);
  if (aAt.length !== bAt.length) return false;
  for (const key of aAt) {
    if (a.writeAt[key] !== b.writeAt[key]) return false;
  }
  return true;
}

/** Stored `vod_resume_json`: legacy flat map, or `{ sec, at }`. */
export function parseStoredVodResume(raw: unknown): VodResumeSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { sec: {}, writeAt: {} };
  }
  const record = raw as Record<string, unknown>;
  if (
    record.sec != null &&
    typeof record.sec === "object" &&
    !Array.isArray(record.sec)
  ) {
    return trimVodResumeSnapshot({
      sec: record.sec as Record<string, number>,
      writeAt:
        record.at != null && typeof record.at === "object" && !Array.isArray(record.at)
          ? (record.at as Record<string, number>)
          : {},
    });
  }
  return trimVodResumeSnapshot({
    sec: record as Record<string, number>,
    writeAt: {},
  });
}

export function serializeVodResume(snapshot: VodResumeSnapshot): string {
  return JSON.stringify({ sec: snapshot.sec, at: snapshot.writeAt });
}
