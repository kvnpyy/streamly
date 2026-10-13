import { describe, expect, it } from "vitest";
import { claimVodTranscodeResetIn } from "./vod-transcode-reset";

describe("claimVodTranscodeResetIn", () => {
  it("honors one token once per encode", () => {
    const seen = new Map<string, number>();
    expect(claimVodTranscodeResetIn(seen, "abc", "171000", 1)).toBe(true);
    expect(claimVodTranscodeResetIn(seen, "abc", "171000", 2)).toBe(false);
    expect(claimVodTranscodeResetIn(seen, "abc", "171111", 3)).toBe(true);
    expect(claimVodTranscodeResetIn(seen, "other", "171000", 4)).toBe(true);
  });

  it("ignores a blank token", () => {
    const seen = new Map<string, number>();
    expect(claimVodTranscodeResetIn(seen, "abc", "  ", 1)).toBe(false);
    expect(seen.size).toBe(0);
  });
});
