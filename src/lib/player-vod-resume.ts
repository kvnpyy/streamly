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

/**
 * Manual mark-watched when Xtream did not send a usable runtime.
 * Larger than any real title so the player must skip resume, not seek here.
 */
export const MANUAL_WATCHED_RESUME_SEC = 1_000_000;

/**
 * Stored resume that counts as finished. Must stay in lockstep with
 * `vodResumeCompletedSec` — `Math.floor(duration * 0.92)` is often 1s below
 * `duration * 0.92`, so comparing against the raw ratio never marked
 * real episode lengths as watched.
 */
export function isVodResumeCompleted(
  resumeSec: number,
  durationSec: number
): boolean {
  if (!Number.isFinite(resumeSec) || resumeSec <= 0) return false;
  if (resumeSec >= MANUAL_WATCHED_RESUME_SEC) return true;
  const completed = vodResumeCompletedSec(durationSec);
  return completed > 0 && resumeSec >= completed;
}

/** Stored resume position that marks a title as fully watched. */
export function vodResumeCompletedSec(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 30) return 0;
  return Math.max(15, Math.floor(durationSec * EPISODE_COMPLETED_RATIO));
}

/** Do not seek into a finished title — start from 0 instead. */
export function shouldSkipVodResumeSeek(
  resumeSec: number,
  durationSec: number
): boolean {
  if (!Number.isFinite(resumeSec) || resumeSec < 15) return false;
  if (isVodResumeCompleted(resumeSec, durationSec)) return true;
  return durationSec > 30 && resumeSec >= durationSec - 25;
}

/** Resume seconds to play from, or null when the title is finished / unset. */
export function playableStoredVodResumeSec(
  stored: number | null | undefined,
  durationSec: number
): number | null {
  if (stored == null || !Number.isFinite(stored) || stored < 15) return null;
  if (shouldSkipVodResumeSeek(stored, durationSec)) return null;
  return Math.floor(stored);
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
