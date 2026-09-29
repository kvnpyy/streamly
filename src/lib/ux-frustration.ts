/**
 * Detects repeated UI actions that usually mean playback is not doing what
 * the viewer asked. Pure thresholds — Sentry emission lives next to this.
 * Never include stream URLs, credentials, or titles.
 */

export const UX_PLAY_WINDOW_MS = 15_000;
export const UX_PLAY_MIN_TOGGLES = 5;
export const UX_SEEK_WINDOW_MS = 25_000;
export const UX_SEEK_MIN_STARTS = 3;
export const UX_SEEK_MIN_MISSES = 2;
export const UX_SEEK_MISS_SEC = 12;
export const UX_SEEK_OPEN_MS = 8_000;
export const UX_RELOAD_WINDOW_MS = 3 * 60_000;
export const UX_RELOAD_MIN = 3;
export const UX_REPORT_COOLDOWN_MS = 2 * 60_000;

export type UxSignal = "play_pause_thrash" | "seek_thrash" | "repeat_reload";

export type UxKind = "live" | "movie" | "series";

export type UxFrustrationEvent = {
  signal: UxSignal;
  message: string;
  fingerprint: string[];
  tags: Record<string, string>;
  extra: Record<string, string | number | boolean>;
};

export type PlayPauseNote = {
  atMs: number;
  intent: "play" | "pause";
  /** Video matched the click a moment later. */
  followed: boolean;
  playheadDeltaSec: number;
  readyState: number;
  hasError: boolean;
  seeking: boolean;
  buffer: "empty" | "starved" | "ahead" | "unknown";
  kind: UxKind;
  device: string;
  detail: string;
};

export type SeekStartNote = {
  atMs: number;
  fromSec: number;
  targetSec: number;
  transcode: boolean;
  kind: UxKind;
  device: string;
};

export type SeekOutcomeNote = {
  atMs: number;
  targetSec: number;
  landedSec: number;
  stillSeeking: boolean;
};

export type ReloadMemory = {
  path: string;
  count: number;
  firstAt: number;
  reported: boolean;
};

type OpenSeek = SeekStartNote & { settled: boolean };

function cooldownOk(
  last: Map<UxSignal, number>,
  signal: UxSignal,
  nowMs: number
): boolean {
  const prev = last.get(signal);
  if (prev == null) return true;
  return nowMs - prev >= UX_REPORT_COOLDOWN_MS;
}

function buildEvent(
  signal: UxSignal,
  why: string,
  kind: string,
  device: string,
  extra: Record<string, string | number | boolean>
): UxFrustrationEvent {
  return {
    signal,
    message: `ux:${signal}`,
    fingerprint: ["ux", signal, why, kind, device],
    tags: {
      ux_signal: signal,
      ux_why: why,
      ux_kind: kind,
      ux_device: device,
    },
    extra: { ...extra, why, kind, device },
  };
}

/** Drop URLs and anything that could carry a playlist secret. */
export function sanitizeUxDetail(raw: string | null | undefined): string {
  const stripped = (raw ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "none";
  if (/\/api\/stream|password|username|token=/i.test(stripped)) return "redacted";
  return stripped.slice(0, 80);
}

/** Pathname only. Query strings can carry session or stream secrets. */
export function sanitizeUxPath(raw: string | null | undefined): string | null {
  const path = (raw ?? "").split("?")[0]?.split("#")[0]?.trim() ?? "";
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.length > 80) return path.slice(0, 80);
  return path;
}

function playWhy(notes: PlayPauseNote[]): string {
  const latest = notes[notes.length - 1];
  if (latest?.hasError) return "error";
  if (notes.some((n) => n.seeking)) return "seeking";
  if (latest && latest.readyState < 2) return "not_ready";
  if (latest?.buffer === "empty" || latest?.buffer === "starved") return "buffer_low";
  const plays = notes.filter((n) => n.intent === "play");
  const stuck =
    plays.length >= 2 && plays.every((n) => n.playheadDeltaSec < 0.6);
  if (stuck && notes.filter((n) => !n.followed).length < 2) return "playhead_stuck";
  return "control_ignored";
}

export class UxFrustrationTracker {
  private plays: PlayPauseNote[] = [];
  private seeks: OpenSeek[] = [];
  private misses: { atMs: number; stillSeeking: boolean; deltaSec: number }[] =
    [];
  private lastReport = new Map<UxSignal, number>();

  notePlayPause(note: PlayPauseNote): UxFrustrationEvent | null {
    this.plays = this.plays.filter((n) => note.atMs - n.atMs <= UX_PLAY_WINDOW_MS);
    this.plays.push(note);
    if (this.plays.length < UX_PLAY_MIN_TOGGLES) return null;
    const unfollowed = this.plays.filter((n) => !n.followed).length;
    const plays = this.plays.filter((n) => n.intent === "play");
    const stuck =
      plays.length >= 2 && plays.every((n) => n.playheadDeltaSec < 0.6);
    if (unfollowed < 2 && !stuck) return null;
    if (!cooldownOk(this.lastReport, "play_pause_thrash", note.atMs)) return null;
    this.lastReport.set("play_pause_thrash", note.atMs);
    const why = playWhy(this.plays);
    const latest = this.plays[this.plays.length - 1]!;
    return buildEvent("play_pause_thrash", why, latest.kind, latest.device, {
      toggles: this.plays.length,
      unfollowed,
      playIntents: plays.length,
      readyState: latest.readyState,
      seeking: latest.seeking,
      buffer: latest.buffer,
      hasError: latest.hasError,
      detail: latest.detail,
    });
  }

  noteSeekStart(note: SeekStartNote): UxFrustrationEvent | null {
    const expired = this.expireOpenSeeks(note.atMs);
    this.seeks = this.seeks.filter((s) => note.atMs - s.atMs <= UX_SEEK_WINDOW_MS);
    this.misses = this.misses.filter((m) => note.atMs - m.atMs <= UX_SEEK_WINDOW_MS);
    const open = this.seeks.find((s) => !s.settled);
    if (open) {
      open.settled = true;
      this.misses.push({
        atMs: note.atMs,
        stillSeeking: true,
        deltaSec: Math.abs(open.targetSec - open.fromSec),
      });
    }
    this.seeks.push({ ...note, settled: false });
    return (
      this.maybeSeekEvent(note.atMs, note.kind, note.device, note.transcode) ??
      expired
    );
  }

  noteSeekOutcome(note: SeekOutcomeNote): UxFrustrationEvent | null {
    const open = [...this.seeks].reverse().find((s) => !s.settled);
    if (!open) return null;
    if (Math.abs(open.targetSec - note.targetSec) > 1.5) return null;
    open.settled = true;
    const deltaSec = Math.abs(note.landedSec - note.targetSec);
    const missed = note.stillSeeking || deltaSec > UX_SEEK_MISS_SEC;
    if (missed) {
      this.misses.push({
        atMs: note.atMs,
        stillSeeking: note.stillSeeking,
        deltaSec,
      });
    }
    return this.maybeSeekEvent(
      note.atMs,
      open.kind,
      open.device,
      open.transcode
    );
  }

  /** Call on a timer so a seek that never lands still counts. */
  expireOpenSeeks(nowMs: number): UxFrustrationEvent | null {
    let last: UxFrustrationEvent | null = null;
    for (const open of this.seeks) {
      if (open.settled) continue;
      if (nowMs - open.atMs < UX_SEEK_OPEN_MS) continue;
      open.settled = true;
      this.misses.push({
        atMs: nowMs,
        stillSeeking: true,
        deltaSec: Math.abs(open.targetSec - open.fromSec),
      });
      last = this.maybeSeekEvent(nowMs, open.kind, open.device, open.transcode);
    }
    return last;
  }

  private maybeSeekEvent(
    nowMs: number,
    kind: string,
    device: string,
    transcode: boolean
  ): UxFrustrationEvent | null {
    const starts = this.seeks.filter((s) => nowMs - s.atMs <= UX_SEEK_WINDOW_MS);
    const misses = this.misses.filter((m) => nowMs - m.atMs <= UX_SEEK_WINDOW_MS);
    if (starts.length < UX_SEEK_MIN_STARTS) return null;
    if (misses.length < UX_SEEK_MIN_MISSES) return null;
    if (!cooldownOk(this.lastReport, "seek_thrash", nowMs)) return null;
    this.lastReport.set("seek_thrash", nowMs);
    const latest = misses[misses.length - 1]!;
    const why = latest.stillSeeking ? "seek_in_flight" : "missed_target";
    return buildEvent("seek_thrash", why, kind, device, {
      starts: starts.length,
      misses: misses.length,
      deltaSec: Math.round(latest.deltaSec),
      transcode,
    });
  }
}

export function assessRepeatReload(opts: {
  nowMs: number;
  path: string | null;
  isReload: boolean;
  stored: ReloadMemory | null;
}): { next: ReloadMemory | null; event: UxFrustrationEvent | null } {
  if (!opts.isReload || !opts.path) return { next: null, event: null };
  const path = opts.path;
  let memory = opts.stored;
  if (
    !memory ||
    memory.path !== path ||
    opts.nowMs - memory.firstAt > UX_RELOAD_WINDOW_MS
  ) {
    return {
      next: { path, count: 1, firstAt: opts.nowMs, reported: false },
      event: null,
    };
  }
  memory = { ...memory, count: memory.count + 1 };
  if (memory.count < UX_RELOAD_MIN || memory.reported) {
    return { next: memory, event: null };
  }
  return {
    next: { ...memory, reported: true },
    event: buildEvent("repeat_reload", "same_page", "browse", "unknown", {
      path,
      reloads: memory.count,
      windowSec: Math.round(UX_RELOAD_WINDOW_MS / 1000),
    }),
  };
}
