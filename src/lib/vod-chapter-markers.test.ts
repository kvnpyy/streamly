import { describe, expect, it } from "vitest";
import {
  chapterMarkerResponseHeaders,
  chapterMarkersFromHeaders,
  markersFromChapters,
  parseFfprobeChapterDump,
  sameChapterMarkers,
  type ProbeChapter,
} from "./vod-chapter-markers";

const opening: ProbeChapter = {
  startSec: 12,
  endSec: 98,
  title: "Opening",
};
const credits: ProbeChapter = {
  startSec: 2488,
  endSec: 2580,
  title: "End Credits",
};

describe("markersFromChapters", () => {
  it("reads intro and credits chapter titles", () => {
    expect(
      markersFromChapters(
        [
          { startSec: 0, endSec: 12, title: "Cold open" },
          opening,
          { startSec: 98, endSec: 2488, title: "Chapter 2" },
          credits,
        ],
        2580
      )
    ).toEqual({
      intro: { startSec: 12, endSec: 98, kind: "intro" },
      creditsStartSec: 2488,
    });
  });

  it("treats a recap chapter as a skippable opening when there is no intro", () => {
    expect(
      markersFromChapters(
        [{ startSec: 0, endSec: 42, title: "Previously On" }],
        2400
      )
    ).toEqual({
      intro: { startSec: 0, endSec: 42, kind: "recap" },
    });
  });

  it("joins a recap that leads straight into the opening", () => {
    expect(
      markersFromChapters(
        [
          { startSec: 0, endSec: 30, title: "Recap" },
          { startSec: 30, endSec: 110, title: "Intro" },
        ],
        2500
      )?.intro
    ).toEqual({ startSec: 0, endSec: 110, kind: "intro" });
  });

  it("ignores generic chapter names", () => {
    expect(
      markersFromChapters(
        [
          { startSec: 0, endSec: 60, title: "Chapter 1" },
          { startSec: 2400, endSec: 2500, title: "Chapter 8" },
        ],
        2500
      )
    ).toBeNull();
  });

  it("rejects a credits chapter in the first half of the file", () => {
    expect(
      markersFromChapters(
        [{ startSec: 40, endSec: 90, title: "Credits" }],
        2400
      )
    ).toBeNull();
  });
});

describe("parseFfprobeChapterDump", () => {
  it("parses ffprobe chapter JSON", () => {
    expect(
      parseFfprobeChapterDump(
        {
          chapters: [
            {
              start_time: "0.000000",
              end_time: "87.500000",
              tags: { title: "Opening Credits" },
            },
            {
              start_time: "3120.000",
              end_time: "3200.000",
              tags: { title: "Ending" },
            },
          ],
        },
        3200
      )
    ).toEqual({
      intro: { startSec: 0, endSec: 87.5, kind: "intro" },
      creditsStartSec: 3120,
    });
  });
});

describe("chapter marker headers", () => {
  it("round-trips intro and credits", () => {
    const markers = {
      intro: { startSec: 8, endSec: 76.25, kind: "intro" as const },
      creditsStartSec: 2410.5,
    };
    const headers = chapterMarkerResponseHeaders(markers);
    expect(
      chapterMarkersFromHeaders({
        introStart: headers["x-vod-intro-start"],
        introEnd: headers["x-vod-intro-end"],
        introKind: headers["x-vod-intro-kind"],
        creditsStart: headers["x-vod-credits-start"],
      })
    ).toEqual(markers);
    expect(sameChapterMarkers(markers, markers)).toBe(true);
  });
});
