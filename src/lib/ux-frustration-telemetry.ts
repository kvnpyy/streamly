import * as Sentry from "@sentry/nextjs";
import {
  bufferAheadBucket,
  detectLiveDeviceClass,
} from "@/lib/live-session-health";
import {
  UxFrustrationTracker,
  assessRepeatReload,
  sanitizeUxDetail,
  sanitizeUxPath,
  type ReloadMemory,
  type UxFrustrationEvent,
  type UxKind,
} from "@/lib/ux-frustration";

const tracker = new UxFrustrationTracker();
const RELOAD_KEY = "ux-reload-v1";
let seekExpireTimer: ReturnType<typeof setTimeout> | null = null;

function deviceClass(): string {
  if (typeof navigator === "undefined") return "unknown";
  const narrow =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 768px)").matches;
  return detectLiveDeviceClass(navigator.userAgent || "", narrow);
}

function emit(event: UxFrustrationEvent | null): void {
  if (!event) return;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return;
  try {
    Sentry.addBreadcrumb({
      category: "ux",
      message: event.message,
      level: "warning",
      data: event.tags,
    });
    Sentry.captureMessage(event.message, {
      level: "warning",
      fingerprint: event.fingerprint,
      tags: event.tags,
      extra: event.extra,
    });
  } catch {
    /* noop */
  }
}

function armSeekExpire(): void {
  if (typeof window === "undefined") return;
  if (seekExpireTimer) window.clearTimeout(seekExpireTimer);
  seekExpireTimer = window.setTimeout(() => {
    seekExpireTimer = null;
    emit(tracker.expireOpenSeeks(Date.now()));
  }, 8_000);
}

export function bufferBucketForVideo(
  video: HTMLVideoElement | null
): "empty" | "starved" | "ahead" | "unknown" {
  if (!video || video.buffered.length === 0) return "unknown";
  let end = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    end = Math.max(end, video.buffered.end(i));
  }
  const rel = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  return bufferAheadBucket(end - rel);
}

/** Play or pause was tapped. Call once the video has had a moment to follow. */
export function reportUxPlayPause(input: {
  intent: "play" | "pause";
  followed: boolean;
  playheadDeltaSec: number;
  readyState: number;
  hasError: boolean;
  seeking: boolean;
  buffer: "empty" | "starved" | "ahead" | "unknown";
  kind: UxKind;
  detail?: string | null;
}): void {
  emit(
    tracker.notePlayPause({
      atMs: Date.now(),
      intent: input.intent,
      followed: input.followed,
      playheadDeltaSec: input.playheadDeltaSec,
      readyState: input.readyState,
      hasError: input.hasError,
      seeking: input.seeking,
      buffer: input.buffer,
      kind: input.kind,
      device: deviceClass(),
      detail: sanitizeUxDetail(input.detail),
    })
  );
}

export function reportUxSeekStart(input: {
  kind: UxKind;
  fromSec: number;
  targetSec: number;
  transcode: boolean;
}): void {
  emit(
    tracker.noteSeekStart({
      atMs: Date.now(),
      fromSec: input.fromSec,
      targetSec: input.targetSec,
      transcode: input.transcode,
      kind: input.kind,
      device: deviceClass(),
    })
  );
  armSeekExpire();
}

export function reportUxSeekOutcome(input: {
  targetSec: number;
  landedSec: number;
  stillSeeking: boolean;
}): void {
  emit(
    tracker.noteSeekOutcome({
      atMs: Date.now(),
      targetSec: input.targetSec,
      landedSec: input.landedSec,
      stillSeeking: input.stillSeeking,
    })
  );
}

function readReloadMemory(): ReloadMemory | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReloadMemory;
    if (!parsed || typeof parsed.path !== "string" || typeof parsed.count !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** A full reload of the same pathname. In-app route changes are ignored. */
export function reportUxPageReload(input: {
  path: string;
  isReload: boolean;
}): void {
  const assessed = assessRepeatReload({
    nowMs: Date.now(),
    path: sanitizeUxPath(input.path),
    isReload: input.isReload,
    stored: readReloadMemory(),
  });
  try {
    if (assessed.next) sessionStorage.setItem(RELOAD_KEY, JSON.stringify(assessed.next));
    else sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* private mode */
  }
  if (assessed.event) {
    assessed.event.tags.ux_device = deviceClass();
    assessed.event.fingerprint = assessed.event.fingerprint.map((part, i) =>
      i === assessed.event!.fingerprint.length - 1 ? deviceClass() : part
    );
    assessed.event.extra.device = deviceClass();
  }
  emit(assessed.event);
}
