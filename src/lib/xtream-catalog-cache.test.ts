import { describe, expect, it } from "vitest";
import {
  isXtreamCatalogCacheAction,
  XTREAM_CATALOG_CACHE_MAX_AGE_SEC,
  xtreamCatalogCacheControlHeader,
} from "./xtream-catalog-cache";

describe("isXtreamCatalogCacheAction", () => {
  it("returns true for catalog list actions", () => {
    expect(isXtreamCatalogCacheAction("get_live_streams")).toBe(true);
    expect(isXtreamCatalogCacheAction("get_live_categories")).toBe(true);
  });

  it("returns false for auth, detail, and EPG actions", () => {
    expect(isXtreamCatalogCacheAction(null)).toBe(false);
    expect(isXtreamCatalogCacheAction("")).toBe(false);
    expect(isXtreamCatalogCacheAction("get_vod_info")).toBe(false);
    expect(isXtreamCatalogCacheAction("get_series_info")).toBe(false);
    expect(isXtreamCatalogCacheAction("get_short_epg")).toBe(false);
    expect(isXtreamCatalogCacheAction("get_simple_data_table")).toBe(false);
  });
});

describe("xtreamCatalogCacheControlHeader", () => {
  it("includes max-age and stale-while-revalidate", () => {
    const h = xtreamCatalogCacheControlHeader();
    expect(h).toContain("private");
    expect(h).toContain(`max-age=${XTREAM_CATALOG_CACHE_MAX_AGE_SEC}`);
    expect(h).toContain(
      `stale-while-revalidate=${XTREAM_CATALOG_CACHE_MAX_AGE_SEC * 2}`
    );
  });
});
