import { describe, expect, it } from "vitest";
import {
  defaultTvJoinTab,
  isLivingRoomClientSnapshot,
  isLivingRoomServerSnapshot,
  isTvJoinClient,
} from "./tv-server-hints";

describe("tv-server-hints", () => {
  const tvHints = { tvServerHint: true, silkHint: false };
  const desktopHints = { tvServerHint: false, silkHint: false };

  it("detects TV join clients from middleware hints", () => {
    expect(isTvJoinClient(tvHints)).toBe(true);
    expect(isTvJoinClient({ tvServerHint: false, silkHint: true })).toBe(true);
    expect(isTvJoinClient(desktopHints)).toBe(false);
  });

  it("keeps server and client living-room snapshots aligned on TV", () => {
    expect(isLivingRoomServerSnapshot(tvHints)).toBe(true);
    expect(isLivingRoomClientSnapshot(tvHints, false)).toBe(true);
  });

  it("defaults join tab to PIN on TV", () => {
    expect(defaultTvJoinTab(tvHints)).toBe("pin");
    expect(defaultTvJoinTab(desktopHints)).toBe("xtream");
  });
});
