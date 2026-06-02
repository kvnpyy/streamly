import { describe, expect, it } from "vitest";
import {
  buildImageProxy,
  proxiedCssBackground,
  resolveProviderMediaUrl,
} from "./image-proxy";

describe("resolveProviderMediaUrl", () => {
  it("resolves protocol-relative and path URLs", () => {
    expect(
      resolveProviderMediaUrl("//cdn.example/logo.png", "http://panel:8080")
    ).toBe("http://cdn.example/logo.png");
    expect(
      resolveProviderMediaUrl("/images/ch.png", "http://192.168.0.5:8080")
    ).toBe("http://192.168.0.5:8080/images/ch.png");
  });
});

describe("buildImageProxy", () => {
  it("never returns a raw http URL", () => {
    const out = buildImageProxy(
      "http://192.168.1.10/logo.png",
      "http://panel:8080"
    );
    expect(out).toMatch(/^\/api\/img\?u=/);
    expect(out).not.toMatch(/^https?:\/\//);
  });

  it("returns undefined for relative URLs without panel server", () => {
    expect(buildImageProxy("/logo.png")).toBeUndefined();
  });
});

describe("proxiedCssBackground", () => {
  it("only emits same-origin proxy paths", () => {
    const bg = proxiedCssBackground("http://10.0.0.1/x.png");
    expect(bg).toMatch(/^url\("\/api\/img\?u=/);
  });
});
