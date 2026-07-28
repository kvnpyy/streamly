import { describe, expect, it } from "vitest";
import {
  quantizeTranscodeSeekSec,
  shouldReuseTranscodeJobForSeek,
  transcodeSeekNeedsServerRestart,
} from "@/lib/vod-transcode-seek-policy";

describe("shouldReuseTranscodeJobForSeek covers full from-0 movie", () => {
  it("reuses a finished from-0 encode for a mid-film scrub", () => {
    expect(
      shouldReuseTranscodeJobForSeek({
        jobStartOffsetSec: 0,
        encodedSec: 9935,
        seekSec: 2400,
        procAlive: false,
      })
    ).toBe(true);
  });
});

describe("quantizeTranscodeSeekSec", () => {
  it("keeps zero exact", () => {
    expect(quantizeTranscodeSeekSec(0)).toBe(0);
    expect(quantizeTranscodeSeekSec(-5)).toBe(0);
  });

  it("buckets recovery noise into 60s slots", () => {
    expect(quantizeTranscodeSeekSec(3)).toBe(0);
    expect(quantizeTranscodeSeekSec(13)).toBe(0);
    expect(quantizeTranscodeSeekSec(23)).toBe(0);
    expect(quantizeTranscodeSeekSec(59)).toBe(0);
    expect(quantizeTranscodeSeekSec(60)).toBe(60);
    expect(quantizeTranscodeSeekSec(378)).toBe(360);
  });
});

describe("transcodeSeekNeedsServerRestart", () => {
  it("does not restart when sitting on the growing tip", () => {
    expect(
      transcodeSeekNeedsServerRestart({
        absoluteSec: 376,
        startOffsetSec: 0,
        encodedSec: 376,
      })
    ).toBe(false);
    expect(
      transcodeSeekNeedsServerRestart({
        absoluteSec: 380,
        startOffsetSec: 0,
        encodedSec: 376,
      })
    ).toBe(false);
  });

  it("restarts when the user scrubs well past the tip", () => {
    expect(
      transcodeSeekNeedsServerRestart({
        absoluteSec: 600,
        startOffsetSec: 0,
        encodedSec: 376,
      })
    ).toBe(true);
  });

  it("restarts when seeking before the encode window", () => {
    expect(
      transcodeSeekNeedsServerRestart({
        absoluteSec: 100,
        startOffsetSec: 360,
        encodedSec: 120,
      })
    ).toBe(true);
  });

  it("ignores tip noise while encode is barely started", () => {
    expect(
      transcodeSeekNeedsServerRestart({
        absoluteSec: 10,
        startOffsetSec: 0,
        encodedSec: 0,
      })
    ).toBe(false);
    expect(
      transcodeSeekNeedsServerRestart({
        absoluteSec: 90,
        startOffsetSec: 0,
        encodedSec: 1,
      })
    ).toBe(true);
  });
});

describe("shouldReuseTranscodeJobForSeek", () => {
  it("reuses a from-0 job that already covers the seek", () => {
    expect(
      shouldReuseTranscodeJobForSeek({
        jobStartOffsetSec: 0,
        encodedSec: 400,
        seekSec: 378,
        procAlive: true,
      })
    ).toBe(true);
  });

  it("reuses a running from-0 job when seek is just past the tip", () => {
    expect(
      shouldReuseTranscodeJobForSeek({
        jobStartOffsetSec: 0,
        encodedSec: 376,
        seekSec: 390,
        procAlive: true,
      })
    ).toBe(true);
  });

  it("does not reuse when scrub is far ahead of a stalled tip", () => {
    expect(
      shouldReuseTranscodeJobForSeek({
        jobStartOffsetSec: 0,
        encodedSec: 100,
        seekSec: 3600,
        procAlive: false,
      })
    ).toBe(false);
  });
});
