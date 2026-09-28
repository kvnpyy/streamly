import { describe, expect, it } from "vitest";
import {
  applyElementMuted,
  playerChromeShowsMuted,
} from "./player-element-mute";

function fakeVideo() {
  const attrs = new Set<string>();
  return {
    muted: false,
    defaultMuted: false,
    setAttribute(name: string) {
      attrs.add(name);
    },
    removeAttribute(name: string) {
      attrs.delete(name);
    },
    has(name: string) {
      return attrs.has(name);
    },
  };
}

describe("applyElementMuted", () => {
  it("sets the property and the attribute together", () => {
    const video = fakeVideo();
    applyElementMuted(video, true);
    expect(video.muted).toBe(true);
    expect(video.defaultMuted).toBe(true);
    expect(video.has("muted")).toBe(true);
  });

  it("clears the attribute when unmuting", () => {
    const video = fakeVideo();
    applyElementMuted(video, true);
    applyElementMuted(video, false);
    expect(video.muted).toBe(false);
    expect(video.defaultMuted).toBe(false);
    expect(video.has("muted")).toBe(false);
  });
});

describe("playerChromeShowsMuted", () => {
  it("treats a zero element volume as muted only where script can set volume", () => {
    expect(
      playerChromeShowsMuted({
        muted: false,
        volume: 0,
        volumeControllable: true,
      })
    ).toBe(true);
    expect(
      playerChromeShowsMuted({
        muted: false,
        volume: 0,
        volumeControllable: false,
      })
    ).toBe(false);
  });

  it("follows the muted flag even when volume is full", () => {
    expect(
      playerChromeShowsMuted({
        muted: true,
        volume: 1,
        volumeControllable: false,
      })
    ).toBe(true);
  });
});
