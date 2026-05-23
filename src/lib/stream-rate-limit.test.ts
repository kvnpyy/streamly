import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStreamRateLimitBuckets,
  limitStreamProxy,
} from "./stream-rate-limit";

describe("limitStreamProxy", () => {
  beforeEach(() => {
    clearStreamRateLimitBuckets();
    delete process.env.STREAM_PROXY_RATE_LIMIT_DISABLED;
    delete process.env.STREAM_PROXY_RATE_WINDOW_MS;
    delete process.env.STREAM_PROXY_RATE_MAX;
  });

  it("allows requests under the cap within the window", () => {
    const ip = "10.0.0.1";
    const t0 = 1_000_000;
    process.env.STREAM_PROXY_RATE_WINDOW_MS = "60000";
    process.env.STREAM_PROXY_RATE_MAX = "3";
    process.env.STREAM_PROXY_RATE_LIMIT_DISABLED = "0";

    expect(limitStreamProxy(ip, t0)).toEqual({ ok: true });
    expect(limitStreamProxy(ip, t0)).toEqual({ ok: true });
    expect(limitStreamProxy(ip, t0)).toEqual({ ok: true });
    const fourth = limitStreamProxy(ip, t0);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window rolls", () => {
    const ip = "10.0.0.2";
    process.env.STREAM_PROXY_RATE_WINDOW_MS = "1000";
    process.env.STREAM_PROXY_RATE_MAX = "2";

    expect(limitStreamProxy(ip, 0)).toEqual({ ok: true });
    expect(limitStreamProxy(ip, 0)).toEqual({ ok: true });
    expect(limitStreamProxy(ip, 0).ok).toBe(false);

    expect(limitStreamProxy(ip, 2000)).toEqual({ ok: true });
  });
});
