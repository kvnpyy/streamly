import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLiveShelfBatch } from "./live-catalog-shelf-batch";

const creds = {
  server: "https://example.com",
  username: "u",
  password: "p",
};

describe("fetchLiveShelfBatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns catalogUnavailable instead of throwing after retryable failures", async () => {
    vi.stubGlobal("window", { location: { origin: "https://test.example" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) })
    );

    const res = await fetchLiveShelfBatch(creds, {
      region: "All",
      offset: 4,
      count: 8,
      limitPerShelf: 6,
    });

    expect(res.catalogUnavailable).toBe(true);
    expect(res.shelves).toEqual([]);
    expect(res.nextOffset).toBe(4);
    expect(res.hasMore).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns catalogUnavailable when API responds ok with flag", async () => {
    vi.stubGlobal("window", { location: { origin: "https://test.example" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          shelves: [],
          nextOffset: 0,
          hasMore: false,
          totalCategories: 0,
          catalogUnavailable: true,
        }),
      })
    );

    const res = await fetchLiveShelfBatch(creds, {
      region: "All",
      offset: 0,
      count: 8,
      limitPerShelf: 6,
    });

    expect(res.catalogUnavailable).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
