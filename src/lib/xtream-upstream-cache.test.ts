import { describe, expect, it } from "vitest";
import {
  getXtreamUpstreamCached,
  setXtreamUpstreamCached,
  xtreamUpstreamCacheKey,
} from "./xtream-upstream-cache";

describe("xtream-upstream-cache", () => {
  const creds = {
    server: "https://panel.example.com",
    username: "user",
    password: "pass",
  };

  it("returns cached catalog body within TTL", () => {
    const key = xtreamUpstreamCacheKey(creds, {
      action: "get_live_streams",
    });
    setXtreamUpstreamCached(key, '{"ok":true}', "get_live_streams", 1_000);
    expect(getXtreamUpstreamCached(key, 1_500)).toBe('{"ok":true}');
    expect(getXtreamUpstreamCached(key, 999_000)).toBeNull();
  });

  it("uses stable keys for param order", () => {
    const a = xtreamUpstreamCacheKey(creds, {
      action: "get_short_epg",
      stream_id: "1",
    });
    const b = xtreamUpstreamCacheKey(creds, {
      stream_id: "1",
      action: "get_short_epg",
    });
    expect(a).toBe(b);
  });
});
