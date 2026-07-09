import { describe, expect, it } from "vitest";
import {
  CAST_PREP_FRESH_MS,
  isCastPreparedMediaFresh,
  type CastPreparedMedia,
} from "./cast-prepare";

describe("isCastPreparedMediaFresh", () => {
  const base: CastPreparedMedia = {
    playUrl: "https://app.example/api/stream?u=x&type=hls&cast=1",
    contentType: "application/vnd.apple.mpegurl",
    streamType: "live",
    sourceUrl: "https://app.example/api/stream?u=master&type=hls&cast=1",
    preparedAt: 1_000_000,
  };

  it("accepts matching source within TTL", () => {
    expect(
      isCastPreparedMediaFresh(base, base.sourceUrl, base.preparedAt + 1_000)
    ).toBe(true);
  });

  it("rejects mismatched source URL", () => {
    expect(
      isCastPreparedMediaFresh(
        base,
        "https://app.example/api/stream?u=other&type=hls&cast=1",
        base.preparedAt + 1_000
      )
    ).toBe(false);
  });

  it("rejects stale prep past TTL", () => {
    expect(
      isCastPreparedMediaFresh(
        base,
        base.sourceUrl,
        base.preparedAt + CAST_PREP_FRESH_MS + 1
      )
    ).toBe(false);
  });

  it("rejects null", () => {
    expect(isCastPreparedMediaFresh(null, base.sourceUrl, Date.now())).toBe(
      false
    );
  });
});
