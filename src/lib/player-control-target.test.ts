import { describe, expect, it } from "vitest";
import {
  isPlayPauseShortcutKey,
  isPlayerControlKeyboardTarget,
  isRemoteActivateKey,
  liveChannelFlipKeyDelta,
  vodArrowSeekDeltaSec,
} from "./player-control-target";

describe("isPlayerControlKeyboardTarget", () => {
  it("returns false for non-element targets", () => {
    expect(isPlayerControlKeyboardTarget(null)).toBe(false);
    expect(isPlayerControlKeyboardTarget({})).toBe(false);
  });
});

describe("isRemoteActivateKey", () => {
  it("matches Space and Enter", () => {
    expect(isRemoteActivateKey(" ")).toBe(true);
    expect(isRemoteActivateKey("Enter")).toBe(true);
    expect(isRemoteActivateKey("Escape")).toBe(false);
  });
});

describe("isPlayPauseShortcutKey", () => {
  it("includes media keys", () => {
    expect(isPlayPauseShortcutKey("MediaPlayPause")).toBe(true);
    expect(isPlayPauseShortcutKey("f")).toBe(false);
  });
});

describe("vodArrowSeekDeltaSec", () => {
  it("maps horizontal arrows for VOD only", () => {
    expect(
      vodArrowSeekDeltaSec("ArrowRight", { isLive: false, seekStep: 10 })
    ).toBe(10);
    expect(
      vodArrowSeekDeltaSec("ArrowLeft", { isLive: false, seekStep: 10 })
    ).toBe(-10);
    expect(
      vodArrowSeekDeltaSec("ArrowRight", { isLive: true, seekStep: 10 })
    ).toBeNull();
    expect(vodArrowSeekDeltaSec("ArrowUp", { isLive: false, seekStep: 10 })).toBeNull();
  });
});

describe("liveChannelFlipKeyDelta", () => {
  it("maps channel and arrow keys", () => {
    expect(liveChannelFlipKeyDelta("ChannelUp")).toBe(-1);
    expect(liveChannelFlipKeyDelta("ChannelDown")).toBe(1);
    expect(liveChannelFlipKeyDelta("ArrowUp")).toBe(-1);
    expect(liveChannelFlipKeyDelta("ArrowDown")).toBe(1);
    expect(liveChannelFlipKeyDelta("Escape")).toBeNull();
  });

  it("maps legacy Samsung key codes", () => {
    expect(liveChannelFlipKeyDelta("", 427)).toBe(-1);
    expect(liveChannelFlipKeyDelta("", 428)).toBe(1);
  });
});
