import { describe, expect, it } from "vitest";
import {
  CAST_PREP_FAIL_COOLDOWN_MS,
  CAST_PREP_FRESH_MS,
  isCastPreparedMediaFresh,
  isCastPrepFailCoolingDown,
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

describe("isCastPrepFailCoolingDown", () => {
  const url = "https://app.example/api/stream?u=master&type=hls&cast=1";

  it("blocks retries for the same URL within cooldown", () => {
    expect(
      isCastPrepFailCoolingDown({ url, at: 1_000 }, url, 1_000 + 30_000)
    ).toBe(true);
  });

  it("allows retry after cooldown", () => {
    expect(
      isCastPrepFailCoolingDown(
        { url, at: 1_000 },
        url,
        1_000 + CAST_PREP_FAIL_COOLDOWN_MS + 1
      )
    ).toBe(false);
  });

  it("does not block a different URL", () => {
    expect(
      isCastPrepFailCoolingDown(
        { url, at: 1_000 },
        "https://app.example/api/stream?u=other&type=hls&cast=1",
        1_000 + 1_000
      )
    ).toBe(false);
  });

  it("treats null as not cooling down", () => {
    expect(isCastPrepFailCoolingDown(null, url, Date.now())).toBe(false);
  });
});
