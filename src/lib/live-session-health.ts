import { isAmazonSilkUserAgent, isTvClassUserAgent } from "@/lib/tv-user-agent";

export type LiveDeviceClass = "tv" | "silk" | "mobile" | "desktop";
export type LiveBufferBucket = "empty" | "starved" | "ahead";
export type LiveSessionOutcome = "stall" | "healthy";

export const HEALTHY_LIVE_SESSION_SAMPLE_RATE = 0.01;

export type LiveSessionNote = {
  hlsErrorDetail?: string;
  bufferAheadSec?: number;
  recoveryAction?: string;
  playheadStuck?: boolean;
};

export type LiveSessionEvent = {
  message: "live:session_stall" | "live:session_healthy";
  level: "warning" | "info";
  fingerprint: string[];
  tags: Record<string, string>;
  extra: {
    bufferAheadSec: number;
    playheadStuck: boolean;
    recoveryAction: string;
    hlsErrorDetail: string;
    deviceClass: LiveDeviceClass;
  };
};

export function detectLiveDeviceClass(
  ua: string,
  narrowViewport: boolean
): LiveDeviceClass {
  if (isAmazonSilkUserAgent(ua)) return "silk";
  if (isTvClassUserAgent(ua)) return "tv";
  if (
    narrowViewport ||
    /Android|iPhone|iPad|iPod|\bMobile\b/i.test(ua)
  ) {
    return "mobile";
  }
  return "desktop";
}

/** Bucket seconds so the fingerprint stays stable across one-decimal jitter. */
export function bufferAheadBucket(sec: number): LiveBufferBucket {
  if (!Number.isFinite(sec) || sec <= 0.05) return "empty";
  if (sec < 1.5) return "starved";
  return "ahead";
}

/** Error details are enum names. Anything that looks like a URL stays out of Sentry. */
export function sanitizeHlsErrorDetail(detail: string | undefined): string {
  const raw = (detail ?? "").trim();
  if (!raw) return "none";
  if (/https?:\/\//i.test(raw) || /\/api\/stream/i.test(raw)) return "redacted";
  return raw.slice(0, 80);
}

export function shouldReportHealthySession(roll: number): boolean {
  return roll >= 0 && roll < HEALTHY_LIVE_SESSION_SAMPLE_RATE;
}

export function buildLiveSessionEvent(
  outcome: LiveSessionOutcome,
  deviceClass: LiveDeviceClass,
  note: LiveSessionNote
): LiveSessionEvent {
  const bufferAheadSec = Number.isFinite(note.bufferAheadSec)
    ? Math.round((note.bufferAheadSec as number) * 10) / 10
    : 0;
  const playheadStuck = Boolean(note.playheadStuck);
  const recoveryAction = (note.recoveryAction ?? "none").slice(0, 40) || "none";
  const hlsErrorDetail = sanitizeHlsErrorDetail(note.hlsErrorDetail);
  const buffer = bufferAheadBucket(bufferAheadSec);
  return {
    message: outcome === "stall" ? "live:session_stall" : "live:session_healthy",
    level: outcome === "stall" ? "warning" : "info",
    fingerprint: [
      "live-session",
      outcome,
      deviceClass,
      hlsErrorDetail,
      buffer,
      recoveryAction,
      playheadStuck ? "stuck" : "moving",
    ],
    tags: {
      live_outcome: outcome,
      live_device: deviceClass,
      live_hls_detail: hlsErrorDetail,
      live_buffer: buffer,
      live_recovery: recoveryAction,
      live_playhead: playheadStuck ? "stuck" : "moving",
    },
    extra: {
      bufferAheadSec,
      playheadStuck,
      recoveryAction,
      hlsErrorDetail,
      deviceClass,
    },
  };
}

/**
 * One explicit event per live viewing. The first stall wins. A session that
 * never stalls is reported only when `finish` is sampled.
 */
export class LiveSessionHealthTracker {
  private stalled = false;
  private emitted = false;
  private last: LiveSessionNote = {};

  constructor(private readonly deviceClass: LiveDeviceClass) {}

  noteStall(note: LiveSessionNote): LiveSessionEvent | null {
    this.last = { ...this.last, ...note };
    this.stalled = true;
    if (this.emitted) return null;
    this.emitted = true;
    return buildLiveSessionEvent("stall", this.deviceClass, this.last);
  }

  finish(roll: number): LiveSessionEvent | null {
    if (this.stalled || this.emitted) return null;
    if (!shouldReportHealthySession(roll)) return null;
    this.emitted = true;
    return buildLiveSessionEvent("healthy", this.deviceClass, {
      ...this.last,
      recoveryAction: this.last.recoveryAction ?? "none",
      playheadStuck: false,
      hlsErrorDetail: this.last.hlsErrorDetail ?? "none",
    });
  }
}
