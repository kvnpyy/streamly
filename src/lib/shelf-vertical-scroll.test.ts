import { describe, expect, it } from "vitest";
import {
  shelfWheelScrollsPage,
  wheelDeltaToPixels,
} from "./shelf-vertical-scroll";

describe("shelfWheelScrollsPage", () => {
  it("sends a vertical trackpad gesture to the page", () => {
    expect(shelfWheelScrollsPage(2, 40)).toBe(true);
    expect(shelfWheelScrollsPage(0, -12)).toBe(true);
  });

  it("keeps a sideways gesture on the channel row", () => {
    expect(shelfWheelScrollsPage(40, 2)).toBe(false);
    expect(shelfWheelScrollsPage(-20, 0)).toBe(false);
  });
});

describe("wheelDeltaToPixels", () => {
  it("passes pixel deltas through", () => {
    expect(wheelDeltaToPixels(48, 0, 800)).toBe(48);
  });

  it("converts line and page modes", () => {
    expect(wheelDeltaToPixels(2, 1, 800)).toBe(32);
    expect(wheelDeltaToPixels(1, 2, 800)).toBe(800);
  });
});
