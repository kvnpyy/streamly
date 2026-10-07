import { describe, expect, it } from "vitest";
import {
  detectTranscodeBackwardSnap,
  isAtTranscodeBufferEdge,
  isEncodeCaughtUp,
  isNearEpisodeEnd,
  shouldTreatTranscodeAsEnded,
  shouldTreatTranscodeSnapAsEnded,
  shouldIgnoreOutgoingTranscodeClock,
  vodTranscodeRecoveryPlayhead,
  vodTranscodeWaitBridgeSec,
  shouldFlushVodPictureStall,
  shouldHoldTranscodeSeekTarget,
} from "./player-transcode-playback-end";

function mockVideo(opts: {
  currentTime: number;
  bufferedEnd: number;
  paused?: boolean;
  ended?: boolean;
}): HTMLVideoElement {
  const ranges = {
    length: opts.bufferedEnd > 0 ? 1 : 0,
    start: () => 0,
    end: () => opts.bufferedEnd,
  };
  return {
    currentTime: opts.currentTime,
    buffered: ranges,
    paused: opts.paused ?? false,
    ended: opts.ended ?? false,
  } as unknown as HTMLVideoElement;
}

describe("isNearEpisodeEnd", () => {
  it("is true inside the finale margin", () => {
    expect(isNearEpisodeEnd(3565, 3600)).toBe(true);
    expect(isNearEpisodeEnd(3500, 3600)).toBe(false);
  });
});

describe("isAtTranscodeBufferEdge", () => {
  it("detects when the playhead is at the buffer end", () => {
    expect(
      isAtTranscodeBufferEdge(mockVideo({ currentTime: 118, bufferedEnd: 118.5 }))
    ).toBe(true);
    expect(
      isAtTranscodeBufferEdge(mockVideo({ currentTime: 100, bufferedEnd: 120 }))
    ).toBe(false);
  });
});

describe("shouldTreatTranscodeAsEnded", () => {
  it("ends at the finale when the buffer is exhausted", () => {
    expect(
      shouldTreatTranscodeAsEnded({
        video: mockVideo({ currentTime: 1655, bufferedEnd: 1655.4 }),
        startOffsetSec: 1943,
        durationSec: 3601,
        encodedSecRel: 1660,
      })
    ).toBe(true);
  });

  it("does not end mid-episode when only the encode edge is reached", () => {
    expect(
      shouldTreatTranscodeAsEnded({
        video: mockVideo({ currentTime: 118, bufferedEnd: 118.5 }),
        startOffsetSec: 0,
        durationSec: 3600,
        encodedSecRel: 120,
      })
    ).toBe(false);
    expect(
      shouldTreatTranscodeAsEnded({
        video: mockVideo({ currentTime: 119.5, bufferedEnd: 119.9 }),
        startOffsetSec: 0,
        durationSec: 3600,
        encodedSecRel: 120,
      })
    ).toBe(false);
  });

  it("does not end mid-episode after tc_seek resume when encode stalls", () => {
    expect(
      shouldTreatTranscodeAsEnded({
        video: mockVideo({ currentTime: 119.5, bufferedEnd: 119.9 }),
        startOffsetSec: 1800,
        durationSec: 3600,
        encodedSecRel: 120,
      })
    ).toBe(false);
  });

  it("ends when encoder caught up even without a reliable duration hint", () => {
    expect(
      shouldTreatTranscodeAsEnded({
        video: mockVideo({ currentTime: 599, bufferedEnd: 599.4 }),
        startOffsetSec: 0,
        durationSec: 0,
        encodedSecRel: 600,
      })
    ).toBe(true);
  });

  it("does not end while paused at the encode edge", () => {
    expect(
      shouldTreatTranscodeAsEnded({
        video: {
          ...mockVideo({ currentTime: 3565, bufferedEnd: 3565.4 }),
          paused: true,
          ended: false,
        } as HTMLVideoElement,
        startOffsetSec: 0,
        durationSec: 3600,
        encodedSecRel: 3568,
      })
    ).toBe(false);
  });
});

describe("shouldTreatTranscodeSnapAsEnded", () => {
  it("does not treat mid-episode snap-back as ended", () => {
    expect(
      shouldTreatTranscodeSnapAsEnded(12, 580, 0, 3600)
    ).toBe(false);
  });

  it("treats snap-back near the finale as ended", () => {
    expect(
      shouldTreatTranscodeSnapAsEnded(1655, 1660, 1943, 3601)
    ).toBe(true);
  });
});

describe("isEncodeCaughtUp", () => {
  it("is true when playhead is at the encode frontier", () => {
    expect(isEncodeCaughtUp(599, 600)).toBe(true);
    expect(isEncodeCaughtUp(100, 600)).toBe(false);
  });
});

describe("vodTranscodeRecoveryPlayhead", () => {
  it("stays on the playhead when playback has not snapped", () => {
    expect(
      vodTranscodeRecoveryPlayhead({ currentRel: 2408, highWaterRel: 2410 })
    ).toBe(2408);
  });

  it("returns the furthest point after a snap back to the opening", () => {
    expect(
      vodTranscodeRecoveryPlayhead({ currentRel: 0.2, highWaterRel: 2410 })
    ).toBe(2410);
  });
});

describe("shouldHoldTranscodeSeekTarget", () => {
  it("holds a backward scrub while the playhead is still at the old tip", () => {
    expect(
      shouldHoldTranscodeSeekTarget({
        currentRel: 3600,
        maxSeenRel: 3600,
        watermarkRel: 600,
      })
    ).toBe(true);
  });

  it("releases once the playhead has reached the scrub target", () => {
    expect(
      shouldHoldTranscodeSeekTarget({
        currentRel: 600.4,
        maxSeenRel: 3600,
        watermarkRel: 600,
      })
    ).toBe(false);
  });
});

describe("shouldIgnoreOutgoingTranscodeClock", () => {
  it("ignores the previous episode clock after next-episode resets the high-water mark", () => {
    expect(
      shouldIgnoreOutgoingTranscodeClock({
        holdOutgoing: true,
        currentRel: 3520,
        highWaterRel: 0,
      })
    ).toBe(true);
  });

  it("accepts the new episode once its clock is near the reset mark", () => {
    expect(
      shouldIgnoreOutgoingTranscodeClock({
        holdOutgoing: true,
        currentRel: 1.2,
        highWaterRel: 0,
      })
    ).toBe(false);
  });

  it("does not ignore a normal playhead when no title change is in flight", () => {
    expect(
      shouldIgnoreOutgoingTranscodeClock({
        holdOutgoing: false,
        currentRel: 3520,
        highWaterRel: 0,
      })
    ).toBe(false);
  });
});

describe("detectTranscodeBackwardSnap", () => {
  it("detects hls snap-back loops", () => {
    expect(detectTranscodeBackwardSnap(12, 580)).toBe(true);
    expect(detectTranscodeBackwardSnap(578, 580)).toBe(false);
  });
});

describe("vodTranscodeWaitBridgeSec", () => {
  it("crosses only a blink-sized gap", () => {
    expect(
      vodTranscodeWaitBridgeSec(
        10,
        [
          { start: 0, end: 10.02 },
          { start: 10.12, end: 20 },
        ],
        false
      )
    ).toBeCloseTo(10.13, 2);
  });

  it("does not walk forward through media that is already buffered", () => {
    expect(
      vodTranscodeWaitBridgeSec(10, [{ start: 0, end: 40 }], false)
    ).toBeNull();
    expect(
      vodTranscodeWaitBridgeSec(
        10,
        [
          { start: 0, end: 10.05 },
          { start: 10.6, end: 20 },
        ],
        false
      )
    ).toBeNull();
  });

  it("does not move a paused video", () => {
    expect(
      vodTranscodeWaitBridgeSec(10, [{ start: 10.1, end: 20 }], true)
    ).toBeNull();
  });
});

describe("shouldFlushVodPictureStall", () => {
  const playing = {
    paused: false,
    seeking: false,
    scrubbing: false,
    hidden: false,
    outgoing: false,
    clockAdvanced: true,
    pictureBehindSec: 0.6,
    nowMs: 10_000,
    lastFlushAtMs: 0,
  };

  it("flushes when the picture sits still and the clock keeps moving", () => {
    expect(shouldFlushVodPictureStall(playing)).toBe(true);
  });

  it("leaves a frame that is keeping up with the sound", () => {
    expect(
      shouldFlushVodPictureStall({ ...playing, pictureBehindSec: 0.04 })
    ).toBe(false);
  });

  it("does not seek while paused, scrubbing, hidden, or waiting on data", () => {
    expect(shouldFlushVodPictureStall({ ...playing, paused: true })).toBe(false);
    expect(shouldFlushVodPictureStall({ ...playing, seeking: true })).toBe(false);
    expect(shouldFlushVodPictureStall({ ...playing, scrubbing: true })).toBe(false);
    expect(shouldFlushVodPictureStall({ ...playing, hidden: true })).toBe(false);
    expect(shouldFlushVodPictureStall({ ...playing, outgoing: true })).toBe(false);
    expect(
      shouldFlushVodPictureStall({ ...playing, clockAdvanced: false })
    ).toBe(false);
  });

  it("waits before flushing the same stall again", () => {
    expect(
      shouldFlushVodPictureStall({ ...playing, lastFlushAtMs: 9_000 })
    ).toBe(false);
  });

  it("does not treat a multi-second jump as this stall", () => {
    expect(
      shouldFlushVodPictureStall({ ...playing, pictureBehindSec: 4 })
    ).toBe(false);
  });
});
