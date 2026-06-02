import { describe, expect, it, vi, beforeEach } from "vitest";

describe("epg-local-cache memory layer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal("requestIdleCallback", undefined);
  });

  it("stores and reads titles in memory", async () => {
    const { setCachedEpgTitle, getBulkCachedEpgTitles } = await import(
      "./epg-local-cache"
    );
    setCachedEpgTitle("s", "u", 1, "News at Six");
    const map = getBulkCachedEpgTitles("s", "u", [1, 2]);
    expect(map.get(1)).toBe("News at Six");
    expect(map.has(2)).toBe(false);
  });

  it("expires stale entries", async () => {
    const {
      setCachedEpgTitle,
      getBulkCachedEpgTitles,
      EPG_CACHE_TTL_MS,
    } = await import("./epg-local-cache");
    setCachedEpgTitle("s", "u", 9, "Old Show");
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + EPG_CACHE_TTL_MS + 1);
    expect(getBulkCachedEpgTitles("s", "u", [9]).has(9)).toBe(false);
    vi.restoreAllMocks();
  });
});
