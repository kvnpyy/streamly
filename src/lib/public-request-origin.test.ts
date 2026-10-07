import { describe, expect, it } from "vitest";
import { publicRequestOrigin } from "./public-request-origin";

function req(url: string, headers: Record<string, string>) {
  const h = new Headers(headers);
  return { url, headers: { get: (name: string) => h.get(name) } };
}

describe("publicRequestOrigin", () => {
  it("uses the forwarded public host instead of the loopback request URL", () => {
    expect(
      publicRequestOrigin(
        req("https://localhost:3000/api/stream?cast=1", {
          "x-forwarded-host": "iptvwebplayer.org",
          "x-forwarded-proto": "https",
          host: "127.0.0.1:3000",
        })
      )
    ).toBe("https://iptvwebplayer.org");
  });

  it("uses the Host header when it is already public", () => {
    expect(
      publicRequestOrigin(
        req("https://localhost:3000/api/stream", {
          host: "iptvwebplayer.org",
          "x-forwarded-proto": "https",
        })
      )
    ).toBe("https://iptvwebplayer.org");
  });

  it("keeps a local dev origin when every host is loopback", () => {
    expect(
      publicRequestOrigin(
        req("http://localhost:3000/api/stream", {
          host: "localhost:3000",
        })
      )
    ).toBe("http://localhost:3000");
  });

  it("reads the first forwarded host", () => {
    expect(
      publicRequestOrigin(
        req("https://127.0.0.1:3000/api/stream", {
          "x-forwarded-host": "iptvwebplayer.org, cdn.example",
          "x-forwarded-proto": "https, https",
        })
      )
    ).toBe("https://iptvwebplayer.org");
  });
});
