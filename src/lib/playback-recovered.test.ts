import { describe, expect, it } from "vitest";
import {
  playbackFailureOverlayShouldDismiss,
  startupFailureStillApplies,
} from "./playback-recovered";

const playing = {
  error: null,
  paused: false,
  ended: false,
  readyState: 2,
  videoWidth: 1280,
  currentTime: 4,
  bufferedLength: 1,
};

describe("playbackFailureOverlayShouldDismiss", () => {
  it("clears the overlay once a picture is moving", () => {
    expect(playbackFailureOverlayShouldDismiss(playing)).toBe(true);
  });

  it("keeps the overlay when playback never started or the element failed", () => {
    expect(
      playbackFailureOverlayShouldDismiss({ ...playing, paused: true })
    ).toBe(false);
    expect(
      playbackFailureOverlayShouldDismiss({ ...playing, videoWidth: 0 })
    ).toBe(false);
    expect(
      playbackFailureOverlayShouldDismiss({ ...playing, currentTime: 0 })
    ).toBe(false);
    expect(
      playbackFailureOverlayShouldDismiss({ ...playing, error: { code: 3 } })
    ).toBe(false);
  });
});

describe("startupFailureStillApplies", () => {
  it("does not fail a start that already has a frame or buffer", () => {
    expect(startupFailureStillApplies(null)).toBe(true);
    expect(startupFailureStillApplies(playing)).toBe(false);
    expect(
      startupFailureStillApplies({
        ...playing,
        paused: true,
        videoWidth: 0,
        currentTime: 0,
        readyState: 2,
      })
    ).toBe(false);
    expect(
      startupFailureStillApplies({
        ...playing,
        paused: true,
        videoWidth: 0,
        currentTime: 0,
        readyState: 0,
        bufferedLength: 1,
      })
    ).toBe(false);
  });
});
