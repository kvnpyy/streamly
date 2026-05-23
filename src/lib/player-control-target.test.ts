import { describe, expect, it } from "vitest";
import {
  isPlayPauseShortcutKey,
  isPlayerControlKeyboardTarget,
  isRemoteActivateKey,
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
