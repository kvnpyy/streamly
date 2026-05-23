import { describe, expect, it } from "vitest";
import { isAllowedStreamProxyUserAgent } from "./stream-client-user-agent";

describe("isAllowedStreamProxyUserAgent", () => {
  const none: string[] = [];

  it("allows typical browser / hls.js Mozilla tokens", () => {
    expect(
      isAllowedStreamProxyUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        none
      )
    ).toBe(true);
    expect(
      isAllowedStreamProxyUserAgent("mozilla/5.0 (Linux; Android 10)", none)
    ).toBe(true);
  });

  it("rejects empty UA", () => {
    expect(isAllowedStreamProxyUserAgent("", none)).toBe(false);
    expect(isAllowedStreamProxyUserAgent("   ", none)).toBe(false);
  });

  it("rejects non-Mozilla clients unless matched by extra substring", () => {
    expect(isAllowedStreamProxyUserAgent("curl/8.0", none)).toBe(false);
    expect(isAllowedStreamProxyUserAgent("python-requests/2.31", none)).toBe(
      false
    );
    expect(
      isAllowedStreamProxyUserAgent("curl/8.0", ["curl"])
    ).toBe(true);
    expect(
      isAllowedStreamProxyUserAgent(
        "iptv-stream/1.0 (+self-hosted)",
        ["iptv-stream"]
      )
    ).toBe(true);
  });
});
