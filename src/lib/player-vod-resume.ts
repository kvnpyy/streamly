import type { PlayerSource } from "@/store/player";
import { usePrefs } from "@/store/preferences";

/** Treat episode as finished when resume is this close to the end. */
export const EPISODE_COMPLETED_RATIO = 0.92;

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

/** Seconds from the end where we stop periodic saves (finale handled on ended/close). */
export const VOD_RESUME_FINALE_MARGIN_SEC = 45;

export function isVodResumeCompleted(
  resumeSec: number,
  durationSec: number
): boolean {
  return (
    durationSec > 30 &&
    Number.isFinite(resumeSec) &&
    resumeSec >= durationSec * EPISODE_COMPLETED_RATIO
  );
}

/** Stored resume position that marks a title as fully watched. */
export function vodResumeCompletedSec(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 30) return 0;
  return Math.max(15, Math.floor(durationSec * EPISODE_COMPLETED_RATIO));
}

export function shouldPersistVodResume(
  absoluteSec: number,
  durationSec: number
): boolean {
  return (
    absoluteSec > 12 &&
    durationSec > 1 &&
    Number.isFinite(durationSec) &&
    absoluteSec < durationSec - VOD_RESUME_FINALE_MARGIN_SEC
  );
}

/** Scrub/resume near the title start should drop continue-watching, not keep an old tip. */
export function shouldClearVodResume(absoluteSec: number): boolean {
  return Number.isFinite(absoluteSec) && absoluteSec <= 12;
}

export type VodResumePersistAction =
  | { type: "clear" }
  | { type: "save"; seconds: number };

/** Single decision point for scrub, close, wake, and periodic saves. */
export function decideVodResumePersist(
  absoluteSec: number,
  durationSec: number
): VodResumePersistAction | null {
  if (!Number.isFinite(absoluteSec) || !Number.isFinite(durationSec)) {
    return null;
  }
  if (shouldClearVodResume(absoluteSec)) return { type: "clear" };
  if (isVodResumeCompleted(absoluteSec, durationSec)) {
    return { type: "save", seconds: vodResumeCompletedSec(durationSec) };
  }
  if (shouldPersistVodResume(absoluteSec, durationSec)) {
    return { type: "save", seconds: absoluteSec };
  }
  return null;
}

/** Apply a persist decision to the prefs store. */
export function applyVodResumePersist(
  storageKey: string | null,
  action: VodResumePersistAction | null
): void {
  if (!storageKey || !action) return;
  if (action.type === "clear") {
    usePrefs.getState().clearVodResume(storageKey);
    return;
  }
  usePrefs.getState().saveVodResume(storageKey, action.seconds);
}
