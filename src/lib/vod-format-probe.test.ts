import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clearVodFormatProbeCache,
  extensionsToProbe,
  extFromHttpUrl,
  probeVodProxyUrl,
  resolveBestVodPlayTarget,
  vodAlternateExtensionCandidates,
} from "./vod-format-probe";

const creds = {
  server: "http://panel.example.com",
  username: "user",
  password: "pass",
};

describe("vodAlternateExtensionCandidates", () => {
  it("keeps mp4 when declared", () => {
    expect(vodAlternateExtensionCandidates("mp4")).toEqual(["mp4"]);
  });

  it("tries mp4/m4v before mkv when panel says mkv", () => {
    const c = vodAlternateExtensionCandidates("mkv");
    expect(c[0]).toBe("mp4");
    expect(c).toContain("mkv");
    expect(c.indexOf("mp4")).toBeLessThan(c.indexOf("mkv"));
  });

  it("probes preferred formats for unknown extension", () => {
    const c = vodAlternateExtensionCandidates(undefined);
    expect(c[0]).toBe("mp4");
    expect(c[c.length - 1]).toBe("mkv");
  });
});

describe("extensionsToProbe", () => {
  it("skips probe when already mp4", () => {
    expect(extensionsToProbe(["mp4"], "mp4")).toEqual([]);
  });

  it("probes alternates but not declared mkv", () => {
    const candidates = vodAlternateExtensionCandidates("mkv");
    const probe = extensionsToProbe(candidates, "mkv");
    expect(probe).not.toContain("mkv");
    expect(probe).toContain("mp4");
  });
});

describe("extFromHttpUrl", () => {
  it("reads extension from direct URLs", () => {
    expect(extFromHttpUrl("https://cdn.example.com/movie/file.mp4?token=1")).toBe(
      "mp4"
    );
  });
});

describe("resolveBestVodPlayTarget", () => {
  beforeEach(() => {
    clearVodFormatProbeCache();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses direct_source without probing", async () => {
    const result = await resolveBestVodPlayTarget(creds, "movie", 99, {
      directSource: "https://cdn.example.com/vod/99.mp4",
      declaredExt: "mkv",
      skipProbe: true,
    });
    expect(result.containerExt).toBe("mp4");
    expect(result.proxyUrl).toContain(encodeURIComponent("99.mp4"));
  });

  it("picks first probe hit for mkv metadata", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("99.mp4")) {
        return new Response(null, {
          status: 200,
          headers: { "content-type": "video/mp4" },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveBestVodPlayTarget(creds, "series", 99, {
      declaredExt: "mkv",
    });
    expect(result.containerExt).toBe("mp4");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("falls back to declared mkv when probes fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 }))
    );

    const result = await resolveBestVodPlayTarget(creds, "series", 42, {
      declaredExt: "mkv",
    });
    expect(result.containerExt).toBe("mkv");
    expect(result.proxyUrl).toContain("42.mkv");
  });
});

describe("probeVodProxyUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects HTML error pages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html>error</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      )
    );
    await expect(
      probeVodProxyUrl("/api/stream?u=http%3A%2F%2Fx%2F1.mp4&type=vod")
    ).resolves.toBe(false);
  });
});
