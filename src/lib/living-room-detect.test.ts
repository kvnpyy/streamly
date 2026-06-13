import { describe, expect, it } from "vitest";
import {
  isLikelyTabletDevice,
  isLivingRoomClient,
  isNativeTvUa,
} from "@/lib/living-room-detect";

const SAMSUNG_TV =
  "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 SamsungBrowser/4.0 Chrome/120.0.0.0 TV Safari/537.36";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const IPADOS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("isLikelyTabletDevice", () => {
  it("detects iPad UA", () => {
    expect(isLikelyTabletDevice(IPAD)).toBe(true);
  });

  it("detects iPadOS desktop UA when touch is present", () => {
    const prev = navigator.maxTouchPoints;
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    try {
      expect(isLikelyTabletDevice(IPADOS_MAC)).toBe(true);
    } finally {
      Object.defineProperty(navigator, "maxTouchPoints", {
        configurable: true,
        value: prev,
      });
    }
  });

  it("does not flag Samsung TV", () => {
    expect(isLikelyTabletDevice(SAMSUNG_TV)).toBe(false);
  });
});

describe("isNativeTvUa", () => {
  it("flags TV-class user agents", () => {
    expect(isNativeTvUa(SAMSUNG_TV)).toBe(true);
  });

  it("does not flag iPad as native TV", () => {
    expect(isNativeTvUa(IPAD)).toBe(false);
  });
});

describe("isLivingRoomClient", () => {
  it("flags native TV UA", () => {
    expect(isLivingRoomClient(false, SAMSUNG_TV)).toBe(true);
  });

  it("keeps iPad on mobile shell without comfort mode", () => {
    expect(isLivingRoomClient(false, IPAD)).toBe(false);
  });

  it("allows iPad comfort TV override", () => {
    expect(isLivingRoomClient(true, IPAD)).toBe(true);
  });
});
