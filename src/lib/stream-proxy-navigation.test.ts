import { describe, expect, it } from "vitest";
import { isBrowserDocumentNavigation } from "./stream-proxy-navigation";

function headers(init: Record<string, string>) {
  const h = new Headers(init);
  return { get: (name: string) => h.get(name) };
}

describe("isBrowserDocumentNavigation", () => {
  it("treats address-bar / new-tab fetches as document navigation", () => {
    expect(
      isBrowserDocumentNavigation(
        headers({ "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" })
      )
    ).toBe(true);
    expect(
      isBrowserDocumentNavigation(headers({ "sec-fetch-mode": "navigate" }))
    ).toBe(true);
  });

  it("does not treat hls.js, Chromecast, or VLC as document navigation", () => {
    expect(
      isBrowserDocumentNavigation(
        headers({ "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" })
      )
    ).toBe(false);
    expect(
      isBrowserDocumentNavigation(headers({ accept: "*/*" }))
    ).toBe(false);
    expect(
      isBrowserDocumentNavigation(
        headers({ accept: "application/vnd.apple.mpegurl" })
      )
    ).toBe(false);
    expect(
      isBrowserDocumentNavigation(
        headers({ range: "bytes=0-1", accept: "text/html,application/xhtml+xml" })
      )
    ).toBe(false);
  });

  it("falls back to Accept: text/html when Fetch Metadata is absent", () => {
    expect(
      isBrowserDocumentNavigation(
        headers({ accept: "text/html,application/xhtml+xml" })
      )
    ).toBe(true);
  });
});
