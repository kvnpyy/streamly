import { describe, expect, it } from "vitest";
import {
  applyChapterMarkers,
  applyLearnedIntro,
  creditsFromEndSec,
  cueTitleDurationSec,
  defaultSeriesIntroSpan,
  emptyVodMarkerDb,
  seriesDefaultIntroAllowed,
  introSpanFromManualSeek,
  resolveCreditsStartSec,
  resolveIntroSpan,
  skipIntroCue,
} from "./vod-playback-markers";

const show = {
  kind: "series" as const,
  id: 9,
  streamId: 101,
  title: "The Office",
};
const nextEp = { ...show, streamId: 102 };

describe("resolveCreditsStartSec", () => {
  it("uses a stored episode credit time", () => {
    expect(
      resolveCreditsStartSec({
        durationSec: 2500,
        episodeCreditsStartSec: 2380,
        showCreditsFromEndSec: 40,
      })
    ).toBe(2380);
  });

  it("reuses the show's credits-from-end offset on the next episode", () => {
    expect(
      resolveCreditsStartSec({
        durationSec: 2600,
        showCreditsFromEndSec: 92,
      })
    ).toBe(2508);
  });

  it("falls back to 75 seconds before the end", () => {
    expect(resolveCreditsStartSec({ durationSec: 2400 })).toBe(2325);
  });

  it("does not guess from a short or unknown duration", () => {
    expect(resolveCreditsStartSec({ durationSec: 90 })).toBeNull();
    expect(cueTitleDurationSec(Number.NaN)).toBe(0);
  });
});

describe("chapter markers persist per episode and show", () => {
  it("stores exact credits and shares the offset with the title", () => {
    const db = applyChapterMarkers(
      emptyVodMarkerDb(),
      show,
      {
        intro: { startSec: 10, endSec: 80, kind: "intro" },
        creditsStartSec: 2400,
      },
      2520
    );
    expect(resolveIntroSpan(db, nextEp)).toMatchObject({
      startSec: 10,
      endSec: 80,
      source: "chapter",
    });
    expect(creditsFromEndSec(2520, 2400)).toBe(120);
    expect(
      resolveCreditsStartSec({
        durationSec: 2480,
        showCreditsFromEndSec: db.shows["series:9:the office"]?.creditsFromEndSec,
      })
    ).toBe(2360);
  });

  it("does not let a manual skip replace chapter-accurate intro times", () => {
    const chaptered = applyChapterMarkers(
      emptyVodMarkerDb(),
      show,
      { intro: { startSec: 5, endSec: 70, kind: "intro" } },
      2400
    );
    const learned = applyLearnedIntro(chaptered, show, {
      startSec: 0,
      endSec: 200,
      kind: "intro",
    });
    expect(resolveIntroSpan(learned, show)?.endSec).toBe(70);
  });
});

describe("skip intro", () => {
  const span = {
    startSec: 0,
    endSec: 90,
    kind: "intro" as const,
    source: "learned" as const,
  };

  it("shows during the intro and seeks just past it", () => {
    expect(
      skipIntroCue({
        timeSec: 12,
        span,
        dismissed: false,
        seeking: false,
      })?.label
    ).toBe("Skip intro");
    expect(
      skipIntroCue({
        timeSec: 12,
        span,
        dismissed: false,
        seeking: false,
      })?.targetSec
    ).toBeGreaterThan(90);
  });

  it("hides while a transcode seek is in flight and after dismiss", () => {
    expect(
      skipIntroCue({ timeSec: 12, span, dismissed: false, seeking: true })
    ).toBeNull();
    expect(
      skipIntroCue({ timeSec: 12, span, dismissed: true, seeking: false })
    ).toBeNull();
  });

  it("offers a standard opening on series before any chapter mark exists", () => {
    expect(seriesDefaultIntroAllowed(0)).toBe(true);
    expect(seriesDefaultIntroAllowed(2400)).toBe(true);
    expect(seriesDefaultIntroAllowed(90)).toBe(false);
    const span = defaultSeriesIntroSpan();
    expect(
      skipIntroCue({
        timeSec: 8,
        span,
        dismissed: false,
        seeking: false,
      })?.label
    ).toBe("Skip intro");
    expect(
      skipIntroCue({
        timeSec: span.endSec + 1,
        span,
        dismissed: false,
        seeking: false,
      })
    ).toBeNull();
  });

  it("learns an intro from a forward scrub in the opening", () => {
    expect(introSpanFromManualSeek(8, 86)).toEqual({
      startSec: 0,
      endSec: 86,
      kind: "intro",
    });
    expect(introSpanFromManualSeek(400, 430)).toBeNull();
    expect(introSpanFromManualSeek(20, 28)).toBeNull();
  });
});
