import { describe, expect, it } from "vitest";
import {
  introEndFromOpeningGaps,
  introProbeStep,
  mergeProbedChapters,
  openingScanPlaylist,
  parseBlackDetectLog,
  parseSilenceDetectLog,
  withDetectedIntro,
} from "./vod-intro-detect";

describe("introEndFromOpeningGaps", () => {
  it("ends the intro on the silence where the theme stops", () => {
    expect(
      introEndFromOpeningGaps({
        silence: [
          { startSec: 2, endSec: 2.4 },
          { startSec: 71.2, endSec: 72.4 },
        ],
        black: [{ startSec: 72.1, endSec: 72.6 }],
      })
    ).toEqual({ startSec: 0, endSec: 72.6, kind: "intro" });
  });

  it("ignores short dialogue pauses and studio-logo black", () => {
    expect(
      introEndFromOpeningGaps({
        silence: [
          { startSec: 30, endSec: 30.4 },
          { startSec: 50, endSec: 50.5 },
        ],
        black: [{ startSec: 6, endSec: 6.4 }],
      })
    ).toBeNull();
  });

  it("uses a later black cut when the theme never goes quiet", () => {
    expect(
      introEndFromOpeningGaps({
        silence: [],
        black: [
          { startSec: 8, endSec: 8.3 },
          { startSec: 54, endSec: 54.4 },
        ],
      })
    ).toEqual({ startSec: 0, endSec: 54.4, kind: "intro" });
  });
});

describe("ffmpeg detect logs", () => {
  it("pairs silence start and end lines", () => {
    const log = [
      "[silencedetect @ 0x1] silence_start: 71.20",
      "[silencedetect @ 0x1] silence_end: 72.40 | silence_duration: 1.20",
    ].join("\n");
    expect(parseSilenceDetectLog(log)).toEqual([
      { startSec: 71.2, endSec: 72.4 },
    ]);
  });

  it("reads blackdetect spans", () => {
    expect(
      parseBlackDetectLog(
        "[blackdetect @ 0x1] black_start:54.0 black_end:54.4 black_duration:0.4"
      )
    ).toEqual([{ startSec: 54, endSec: 54.4 }]);
  });
});

describe("openingScanPlaylist", () => {
  it("keeps headers and stops once the opening is covered", () => {
    const raw = [
      "#EXTM3U",
      '#EXT-X-MAP:URI="init.mp4"',
      "#EXTINF:10.0,",
      "seg_00000.m4s",
      "#EXTINF:10.0,",
      "seg_00001.m4s",
      "#EXTINF:10.0,",
      "seg_00002.m4s",
    ].join("\n");
    expect(openingScanPlaylist(raw, 20)).toBe(
      [
        "#EXTM3U",
        '#EXT-X-MAP:URI="init.mp4"',
        "#EXTINF:10.0,",
        "seg_00000.m4s",
        "#EXTINF:10.0,",
        "seg_00001.m4s",
        "",
      ].join("\n")
    );
  });
});

describe("introProbeStep", () => {
  const base = {
    encodeFinished: false,
    titleDurationSec: 2400,
    scannedSec: 0,
    foundEndSec: null as number | null,
  };

  it("waits until two minutes of the opening exist", () => {
    expect(introProbeStep({ ...base, encodedSec: 40 })).toBe("wait");
    expect(introProbeStep({ ...base, encodedSec: 130 })).toBe("scan");
  });

  it("keeps a clear intro and keeps looking when the hit is on the window edge", () => {
    expect(
      introProbeStep({
        ...base,
        encodedSec: 140,
        scannedSec: 120,
        foundEndSec: 48,
      })
    ).toBe("done");
    expect(
      introProbeStep({
        ...base,
        encodedSec: 140,
        scannedSec: 120,
        foundEndSec: 112,
      })
    ).toBe("wait");
    expect(
      introProbeStep({
        ...base,
        encodedSec: 210,
        scannedSec: 120,
        foundEndSec: 112,
      })
    ).toBe("scan");
  });
});

describe("measured intro versus chapters", () => {
  it("does not replace a chapter intro, and chapters replace a measurement", () => {
    const chapter = {
      intro: { startSec: 8, endSec: 64, kind: "intro" as const },
      introOrigin: "chapter" as const,
    };
    expect(
      withDetectedIntro(chapter, { startSec: 0, endSec: 90, kind: "intro" })
    ).toBe(chapter);
    const measured = withDetectedIntro(undefined, {
      startSec: 0,
      endSec: 47,
      kind: "intro",
    });
    expect(measured.introOrigin).toBe("detected");
    expect(
      mergeProbedChapters(measured, {
        intro: { startSec: 5, endSec: 70, kind: "intro" },
        creditsStartSec: 2300,
      }).introOrigin
    ).toBe("chapter");
  });
});
