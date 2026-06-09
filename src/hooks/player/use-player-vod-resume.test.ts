import { describe, expect, it } from "vitest";
import {
  resolveStoredVodResumeSec,
  vodAbsoluteSec,
  vodRelativeSec,
} from "@/lib/player-vod-resume";

/**
 * Regression: transcode saves used segment-relative seconds while resume/seek
 * treated them as absolute — after a server seek (offset > 0), a stored ~0 value
 * restarted playback at the beginning.
 */
describe("VOD seek/resume timeline", () => {
  it("maps manual seek absolute time to element time under transcode offset", () => {
    const seekAbsolute = 7200;
    const offset = 7200;
    const rel = vodRelativeSec(seekAbsolute, {
      usesTranscode: true,
      startOffsetSec: offset,
    });
    expect(rel).toBe(0);
    expect(
      vodAbsoluteSec(rel, { usesTranscode: true, startOffsetSec: offset })
    ).toBe(seekAbsolute);
  });

  it("does not downgrade a user seek when legacy relative resume is read back", () => {
    const offset = 7200;
    const legacyRelativeSave = 12;
    const absolute = resolveStoredVodResumeSec(legacyRelativeSave, offset);
    expect(absolute).toBe(7212);
    expect(
      vodRelativeSec(absolute, { usesTranscode: true, startOffsetSec: offset })
    ).toBe(12);
  });

  it("persists absolute wall-clock position after watching a transcode segment", () => {
    const offset = 3600;
    const elementTime = 180;
    const saved = vodAbsoluteSec(elementTime, {
      usesTranscode: true,
      startOffsetSec: offset,
    });
    expect(saved).toBe(3780);
    expect(resolveStoredVodResumeSec(saved, offset)).toBe(3780);
  });
});
