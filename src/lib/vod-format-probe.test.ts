import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clearVodFormatProbeCache,
  extensionsToProbe,
  extFromHttpUrl,
  isProbeUpstreamBusyStatus,
  probeVodProxyUrl,
  resolveBestVodPlayTarget,
  shouldSkipVodFormatProbe,
  VOD_FORMAT_PROBE_EXTS,
  VOD_FORMAT_PROBE_FALLBACK_COOLDOWN_MS,
  VOD_FORMAT_PROBE_GAP_MS,
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

  it("only probes mp4 before mkv fallback", () => {
    const candidates = vodAlternateExtensionCandidates("mkv");
    expect(extensionsToProbe(candidates, "mkv")).toEqual(["mp4"]);
    expect(VOD_FORMAT_PROBE_EXTS).toEqual(["mp4"]);
  });
});

describe("isProbeUpstreamBusyStatus", () => {
  it("treats panel limit and proxy errors as busy", () => {
    expect(isProbeUpstreamBusyStatus(409)).toBe(true);
    expect(isProbeUpstreamBusyStatus(502)).toBe(true);
    expect(isProbeUpstreamBusyStatus(551)).toBe(true);
    expect(isProbeUpstreamBusyStatus(404)).toBe(false);
  });
});

describe("extFromHttpUrl", () => {
  it("reads extension from direct URLs", () => {
    expect(extFromHttpUrl("https://cdn.example.com/movie/file.mp4?token=1")).toBe(
      "mp4"
    );
  });
});

describe("shouldSkipVodFormatProbe", () => {
  it("skips when server transcode will handle mkv", () => {
    vi.stubEnv("NEXT_PUBLIC_VOD_TRANSCODE", "1");
    expect(shouldSkipVodFormatProbe("mkv")).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("resolveBestVodPlayTarget", () => {
  beforeEach(() => {
    clearVodFormatProbeCache();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

  it("picks mp4 when probe succeeds for mkv metadata", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("probe=1") && u.includes("99.mp4")) {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveBestVodPlayTarget(creds, "movie", 99, {
      declaredExt: "mkv",
      probeGapMs: 0,
      probeFallbackCooldownMs: 0,
    });
    expect(result.containerExt).toBe("mp4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("probe=1");
  });

  it("stops probing after upstream busy and falls back to mkv", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveBestVodPlayTarget(creds, "series", 42, {
      declaredExt: "mkv",
      probeGapMs: 0,
      probeFallbackCooldownMs: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.containerExt).toBe("mkv");
    expect(result.proxyUrl).toContain("42.mkv");
  });

  it("falls back to declared mkv when mp4 probe misses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 }))
    );

    const result = await resolveBestVodPlayTarget(creds, "series", 42, {
      declaredExt: "mkv",
      probeGapMs: 0,
      probeFallbackCooldownMs: 0,
    });
    expect(result.containerExt).toBe("mkv");
    expect(result.proxyUrl).toContain("42.mkv");
  });

  it("skips network probes when transcode handles mkv", async () => {
    vi.stubEnv("NEXT_PUBLIC_VOD_TRANSCODE", "1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveBestVodPlayTarget(creds, "series", 42, {
      declaredExt: "mkv",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.containerExt).toBe("mkv");
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

  it("accepts 204 from probe mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 }))
    );
    await expect(
      probeVodProxyUrl("/api/stream?u=http%3A%2F%2Fx%2F1.mp4&type=vod")
    ).resolves.toBe("hit");
  });

  it("treats upstream busy as busy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 409 }))
    );
    await expect(
      probeVodProxyUrl("/api/stream?u=http%3A%2F%2Fx%2F1.mp4&type=vod")
    ).resolves.toBe("busy");
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
    ).resolves.toBe("miss");
  });
});

describe("VOD_FORMAT_PROBE_GAP_MS", () => {
  it("uses a pause long enough for single-connection panels", () => {
    expect(VOD_FORMAT_PROBE_GAP_MS).toBeGreaterThanOrEqual(500);
    expect(VOD_FORMAT_PROBE_FALLBACK_COOLDOWN_MS).toBeGreaterThanOrEqual(1_000);
  });
});
