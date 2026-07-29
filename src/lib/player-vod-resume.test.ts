import { describe, expect, it } from "vitest";
import {
  resolveStoredVodResumeSec,
  shouldClearVodResume,
  shouldPersistVodResume,
  vodAbsoluteSec,
  vodRelativeSec,
} from "@/lib/player-vod-resume";

describe("vodAbsoluteSec", () => {
  it("returns element time for direct playback", () => {
    expect(
      vodAbsoluteSec(120, { usesTranscode: false, startOffsetSec: 0 })
    ).toBe(120);
  });

  it("adds transcode start offset for segment playback", () => {
    expect(
      vodAbsoluteSec(45, { usesTranscode: true, startOffsetSec: 3600 })
    ).toBe(3645);
  });
});

describe("vodRelativeSec", () => {
  it("subtracts transcode offset for seeks", () => {
    expect(
      vodRelativeSec(3645, { usesTranscode: true, startOffsetSec: 3600 })
    ).toBe(45);
  });

  it("passes through for direct playback", () => {
    expect(
      vodRelativeSec(900, { usesTranscode: false, startOffsetSec: 0 })
    ).toBe(900);
  });
});

describe("resolveStoredVodResumeSec", () => {
  it("keeps absolute values", () => {
    expect(resolveStoredVodResumeSec(7200, 3600)).toBe(7200);
  });

  it("upgrades legacy relative saves when offset is set", () => {
    expect(resolveStoredVodResumeSec(300, 3600)).toBe(3900);
  });
});

describe("shouldPersistVodResume", () => {
  it("skips near start and near end", () => {
    expect(shouldPersistVodResume(5, 3600)).toBe(false);
    expect(shouldPersistVodResume(3560, 3600)).toBe(false);
  });

  it("persists mid-playback positions", () => {
    expect(shouldPersistVodResume(600, 3600)).toBe(true);
  });
});

describe("shouldClearVodResume", () => {
  it("clears continue-watching when scrubbing to the start", () => {
    expect(shouldClearVodResume(0)).toBe(true);
    expect(shouldClearVodResume(8)).toBe(true);
    expect(shouldClearVodResume(13)).toBe(false);
  });
});

describe("transcode seek timeline", () => {
  it("maps a 30-minute scrub to the correct segment-relative time", () => {
    const seekAbsolute = 1800;
    const offset = 1800;
    const rel = vodRelativeSec(seekAbsolute, {
      usesTranscode: true,
      startOffsetSec: offset,
    });
    expect(rel).toBe(0);
    expect(
      vodAbsoluteSec(rel, { usesTranscode: true, startOffsetSec: offset })
    ).toBe(seekAbsolute);
  });
});
