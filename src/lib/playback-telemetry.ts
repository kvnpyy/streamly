import * as Sentry from "@sentry/nextjs";
import {
  LiveSessionHealthTracker,
  detectLiveDeviceClass,
  type LiveSessionEvent,
  type LiveSessionNote,
} from "@/lib/live-session-health";

export type PlaybackBreadcrumbEvent =
  | "stall_soft_recover"
  | "try_again_soft"
  | "try_again_full"
  | "playback_error"
  | "manifest_parsed"
  | "tv_live_freeze_gentle"
  | "tv_live_freeze_soft"
  | "tv_live_freeze_reinit"
  | "tv_live_freeze_play"
  | "tv_live_freeze_media"
  | "tv_live_freeze_reload"
  | "live_mpegts_start"
  | "live_mpegts_fallback";

/** Lightweight playback trail for Sentry — no credentials or raw upstream URLs. */
export function playbackBreadcrumb(
  event: PlaybackBreadcrumbEvent,
  data?: Record<string, string | number | boolean | null | undefined>
): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return;
  try {
    Sentry.addBreadcrumb({
      category: "playback",
      message: event,
      level: event === "playback_error" ? "warning" : "info",
      data: data ?? {},
    });
  } catch {
    /* noop */
  }
}

let liveSession: LiveSessionHealthTracker | null = null;

function emitLiveSessionEvent(event: LiveSessionEvent): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return;
  try {
    Sentry.captureMessage(event.message, {
      level: event.level,
      fingerprint: event.fingerprint,
      tags: event.tags,
      extra: event.extra,
    });
  } catch {
    /* noop */
  }
}

function currentDeviceClass() {
  if (typeof navigator === "undefined") return "desktop" as const;
  const narrow =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 768px)").matches;
  return detectLiveDeviceClass(navigator.userAgent || "", narrow);
}

/** Starts a live viewing. One stall warning, or a 1% healthy sample on end. */
export function beginLivePlaybackSession(): void {
  liveSession = new LiveSessionHealthTracker(currentDeviceClass());
}

/** Explicit stall event. Not an XHR exception, so the fetch ignore list does not drop it. */
export function noteLiveSessionStall(note: LiveSessionNote): void {
  const event = liveSession?.noteStall(note);
  if (event) emitLiveSessionEvent(event);
}

/** Call when the live channel closes. Healthy sessions are sampled at 1%. */
export function endLivePlaybackSession(roll = Math.random()): void {
  const event = liveSession?.finish(roll);
  liveSession = null;
  if (event) emitLiveSessionEvent(event);
}
