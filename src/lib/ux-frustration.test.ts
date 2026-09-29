import { describe, expect, it } from "vitest";
import {
  UX_PLAY_MIN_TOGGLES,
  UX_RELOAD_WINDOW_MS,
  UxFrustrationTracker,
  assessRepeatReload,
  sanitizeUxDetail,
  sanitizeUxPath,
  type PlayPauseNote,
  type SeekStartNote,
} from "./ux-frustration";

function play(partial: Partial<PlayPauseNote> & { atMs: number }): PlayPauseNote {
  return {
    intent: "play",
    followed: false,
    playheadDeltaSec: 0,
    readyState: 1,
    hasError: false,
    seeking: false,
    buffer: "unknown",
    kind: "series",
    device: "desktop",
    detail: "none",
    ...partial,
  };
}

function seekStart(atMs: number, targetSec: number): SeekStartNote {
  return {
    atMs,
    fromSec: targetSec - 30,
    targetSec,
    transcode: true,
    kind: "series",
    device: "mobile",
  };
}

describe("sanitizeUxDetail", () => {
  it("strips urls and secrets", () => {
    expect(sanitizeUxDetail("failed https://x/api/stream?u=1")).toBe("failed");
    expect(sanitizeUxDetail("password=abc")).toBe("redacted");
    expect(sanitizeUxDetail("")).toBe("none");
  });
});

describe("sanitizeUxPath", () => {
  it("keeps a pathname and drops a query", () => {
    expect(sanitizeUxPath("/app/series/12?token=abc")).toBe("/app/series/12");
    expect(sanitizeUxPath("https://evil.example")).toBeNull();
  });
});

describe("play/pause thrash", () => {
  it("ignores a few toggles that the video followed", () => {
    const t = new UxFrustrationTracker();
    for (let i = 0; i < UX_PLAY_MIN_TOGGLES; i++) {
      expect(
        t.notePlayPause(
          play({ atMs: i * 500, followed: true, playheadDeltaSec: 2, readyState: 4 })
        )
      ).toBeNull();
    }
  });

  it("reports when play is tapped and the video stays paused", () => {
    const t = new UxFrustrationTracker();
    let event = null;
    for (let i = 0; i < UX_PLAY_MIN_TOGGLES; i++) {
      event = t.notePlayPause(
        play({
          atMs: 1_000 + i * 400,
          hasError: true,
          detail: "decode",
          readyState: 0,
        })
      );
    }
    expect(event?.signal).toBe("play_pause_thrash");
    expect(event?.tags.ux_why).toBe("error");
    expect(event?.extra.toggles).toBe(UX_PLAY_MIN_TOGGLES);
    expect(event?.fingerprint).toContain("series");
  });

  it("reports a playhead that does not move while they keep hitting play", () => {
    const t = new UxFrustrationTracker();
    let event = null;
    for (let i = 0; i < UX_PLAY_MIN_TOGGLES; i++) {
      event = t.notePlayPause(
        play({
          atMs: 5_000 + i * 300,
          followed: true,
          playheadDeltaSec: 0.1,
          readyState: 4,
          buffer: "ahead",
        })
      );
    }
    expect(event?.tags.ux_why).toBe("playhead_stuck");
  });

  it("does not open a second issue inside the cooldown", () => {
    const t = new UxFrustrationTracker();
    for (let i = 0; i < UX_PLAY_MIN_TOGGLES; i++) {
      t.notePlayPause(play({ atMs: i * 200, hasError: true }));
    }
    expect(
      t.notePlayPause(play({ atMs: 2_000, hasError: true }))
    ).toBeNull();
  });
});

describe("seek thrash", () => {
  it("reports repeated seeks that never land", () => {
    const t = new UxFrustrationTracker();
    expect(t.noteSeekStart(seekStart(0, 100))).toBeNull();
    expect(t.noteSeekStart(seekStart(1_000, 200))).toBeNull();
    const event = t.noteSeekStart(seekStart(2_000, 400));
    expect(event?.signal).toBe("seek_thrash");
    expect(event?.tags.ux_why).toBe("seek_in_flight");
    expect(event?.extra.transcode).toBe(true);
  });

  it("does not report seeks that land on the target", () => {
    const t = new UxFrustrationTracker();
    t.noteSeekStart(seekStart(0, 100));
    t.noteSeekOutcome({ atMs: 400, targetSec: 100, landedSec: 101, stillSeeking: false });
    t.noteSeekStart(seekStart(2_000, 200));
    t.noteSeekOutcome({ atMs: 2_400, targetSec: 200, landedSec: 199, stillSeeking: false });
    const event = t.noteSeekStart(seekStart(4_000, 300));
    t.noteSeekOutcome({ atMs: 4_400, targetSec: 300, landedSec: 300, stillSeeking: false });
    expect(event).toBeNull();
  });

  it("counts a seek that stays far from the target", () => {
    const t = new UxFrustrationTracker();
    t.noteSeekStart(seekStart(0, 500));
    t.noteSeekOutcome({
      atMs: 1_000,
      targetSec: 500,
      landedSec: 120,
      stillSeeking: false,
    });
    t.noteSeekStart(seekStart(2_000, 800));
    const event = t.noteSeekOutcome({
      atMs: 3_000,
      targetSec: 800,
      landedSec: 130,
      stillSeeking: false,
    });
    expect(event).toBeNull();
    const fired = t.noteSeekStart(seekStart(4_000, 900));
    expect(fired?.signal).toBe("seek_thrash");
    expect(fired?.tags.ux_why).toBe("missed_target");
    expect(fired?.extra.misses).toBe(2);
  });
});

describe("assessRepeatReload", () => {
  it("fires on the third reload of the same page and not the fourth", () => {
    const first = assessRepeatReload({
      nowMs: 0,
      path: "/app/series/9",
      isReload: true,
      stored: null,
    });
    expect(first.event).toBeNull();
    const second = assessRepeatReload({
      nowMs: 10_000,
      path: "/app/series/9",
      isReload: true,
      stored: first.next,
    });
    expect(second.event).toBeNull();
    const third = assessRepeatReload({
      nowMs: 20_000,
      path: "/app/series/9",
      isReload: true,
      stored: second.next,
    });
    expect(third.event?.signal).toBe("repeat_reload");
    expect(third.event?.extra.path).toBe("/app/series/9");
    const fourth = assessRepeatReload({
      nowMs: 30_000,
      path: "/app/series/9",
      isReload: true,
      stored: third.next,
    });
    expect(fourth.event).toBeNull();
    expect(fourth.next?.count).toBe(4);
  });

  it("resets when the window expires or the path changes", () => {
    const first = assessRepeatReload({
      nowMs: 0,
      path: "/app/live",
      isReload: true,
      stored: null,
    });
    const expired = assessRepeatReload({
      nowMs: UX_RELOAD_WINDOW_MS + 5,
      path: "/app/live",
      isReload: true,
      stored: first.next,
    });
    expect(expired.next?.count).toBe(1);
    expect(expired.event).toBeNull();
    const other = assessRepeatReload({
      nowMs: 1_000,
      path: "/app/movies",
      isReload: true,
      stored: first.next,
    });
    expect(other.next?.path).toBe("/app/movies");
    expect(other.next?.count).toBe(1);
  });

  it("ignores an in-app navigation", () => {
    expect(
      assessRepeatReload({
        nowMs: 0,
        path: "/app",
        isReload: false,
        stored: { path: "/app", count: 2, firstAt: 0, reported: false },
      })
    ).toEqual({ next: null, event: null });
  });
});
