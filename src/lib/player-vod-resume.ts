import type { PlayerSource } from "@/store/player";

/** Preserved across transcode seek reloads so pipeline resets do not wipe the target. */
export type VodTimelineHold = {
  absoluteTimeSec: number;
  startOffsetSec: number;
  durationSec?: number;
};

/** Stable key for persisted VOD resume (`accountKey|movie|streamId`). */
export function vodResumeStorageKey(
  accountKey: string | undefined,
  current: PlayerSource | null
): string | null {
  if (!accountKey || !current || current.kind === "live") return null;
  const sid = current.streamId ?? current.id;
  return `${accountKey}|${current.kind}|${sid}`;
}

/** Wall-clock position in the full title (seconds). */
export function vodAbsoluteSec(
  currentTime: number,
  opts: { usesTranscode: boolean; startOffsetSec: number }
): number {
  if (!Number.isFinite(currentTime)) return 0;
  return opts.usesTranscode
    ? Math.max(0, opts.startOffsetSec + currentTime)
    : Math.max(0, currentTime);
}

/** `<video>` element time for the active transcode segment (or direct file time). */
export function vodRelativeSec(
  absoluteSec: number,
  opts: { usesTranscode: boolean; startOffsetSec: number }
): number {
  if (!Number.isFinite(absoluteSec)) return 0;
  return opts.usesTranscode
    ? Math.max(0, absoluteSec - opts.startOffsetSec)
    : Math.max(0, absoluteSec);
}

/**
 * Older builds stored transcode position as segment-relative seconds while resume
 * logic treated the value as absolute — upgrade on read when clearly relative.
 */
export function resolveStoredVodResumeSec(
  stored: number,
  startOffsetSec: number
): number {
  if (!Number.isFinite(stored) || stored <= 0) return 0;
  if (startOffsetSec > 0 && stored < startOffsetSec) {
    return startOffsetSec + stored;
  }
  return stored;
}

export function shouldPersistVodResume(
  absoluteSec: number,
  durationSec: number
): boolean {
  return (
    absoluteSec > 12 &&
    durationSec > 1 &&
    Number.isFinite(durationSec) &&
    absoluteSec < durationSec - 45
  );
}
