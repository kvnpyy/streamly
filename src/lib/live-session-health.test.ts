import { describe, expect, it } from "vitest";
import {
  LiveSessionHealthTracker,
  bufferAheadBucket,
  buildLiveSessionEvent,
  detectLiveDeviceClass,
  sanitizeHlsErrorDetail,
  shouldReportHealthySession,
} from "./live-session-health";

describe("live session health", () => {
  it("buckets buffer and strips URLs from the hls detail", () => {
    expect(bufferAheadBucket(0)).toBe("empty");
    expect(bufferAheadBucket(0.4)).toBe("starved");
    expect(bufferAheadBucket(2)).toBe("ahead");
    expect(sanitizeHlsErrorDetail("fragLoadError")).toBe("fragLoadError");
    expect(
      sanitizeHlsErrorDetail("failed https://panel.example/live/a.m3u8")
    ).toBe("redacted");
  });

  it("builds a stable fingerprint from device, detail, buffer, action, and stuck", () => {
    const event = buildLiveSessionEvent("stall", "desktop", {
      hlsErrorDetail: "bufferStalledError",
      bufferAheadSec: 2.24,
      recoveryAction: "reload",
      playheadStuck: true,
    });
    expect(event.level).toBe("warning");
    expect(event.message).toBe("live:session_stall");
    expect(event.fingerprint).toEqual([
      "live-session",
      "stall",
      "desktop",
      "bufferStalledError",
      "ahead",
      "reload",
      "stuck",
    ]);
    expect(event.extra.bufferAheadSec).toBe(2.2);
  });

  it("emits one stall and does not also sample that session as healthy", () => {
    const tracker = new LiveSessionHealthTracker("tv");
    const first = tracker.noteStall({
      hlsErrorDetail: "playhead_freeze",
      bufferAheadSec: 0,
      recoveryAction: "reload",
      playheadStuck: true,
    });
    const second = tracker.noteStall({
      recoveryAction: "remux",
      bufferAheadSec: 0.2,
    });
    expect(first?.fingerprint[5]).toBe("reload");
    expect(second).toBeNull();
    expect(tracker.finish(0)).toBeNull();
  });

  it("samples healthy sessions at 1 percent", () => {
    expect(shouldReportHealthySession(0)).toBe(true);
    expect(shouldReportHealthySession(0.009)).toBe(true);
    expect(shouldReportHealthySession(0.01)).toBe(false);
    const quiet = new LiveSessionHealthTracker("desktop");
    expect(quiet.finish(0.5)).toBeNull();
    const sampled = new LiveSessionHealthTracker("mobile");
    const event = sampled.finish(0.001);
    expect(event?.message).toBe("live:session_healthy");
    expect(event?.level).toBe("info");
    expect(event?.extra.playheadStuck).toBe(false);
  });

  it("classifies silk before generic tv, and phones as mobile", () => {
    expect(
      detectLiveDeviceClass(
        "Mozilla/5.0 (Linux; Android 9; AFTMM) Silk/100.0",
        false
      )
    ).toBe("silk");
    expect(
      detectLiveDeviceClass(
        "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 TV Safari/537.36",
        false
      )
    ).toBe("tv");
    expect(
      detectLiveDeviceClass(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        false
      )
    ).toBe("mobile");
    expect(
      detectLiveDeviceClass(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        false
      )
    ).toBe("desktop");
  });
});
