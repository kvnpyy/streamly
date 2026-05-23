import { afterEach, describe, expect, it, vi } from "vitest";
import {
  maybeLogStreamUpstreamSlow,
  streamSlowLogThresholdMs,
} from "./stream-proxy-slow-log";

describe("streamSlowLogThresholdMs", () => {
  afterEach(() => {
    delete process.env.STREAM_PROXY_SLOW_LOG_MS;
  });

  it("defaults to 2000", () => {
    delete process.env.STREAM_PROXY_SLOW_LOG_MS;
    expect(streamSlowLogThresholdMs()).toBe(2000);
  });

  it("parses STREAM_PROXY_SLOW_LOG_MS", () => {
    process.env.STREAM_PROXY_SLOW_LOG_MS = "3500";
    expect(streamSlowLogThresholdMs()).toBe(3500);
  });
});

describe("maybeLogStreamUpstreamSlow", () => {
  afterEach(() => {
    delete process.env.STREAM_PROXY_SLOW_LOG_DISABLED;
    delete process.env.STREAM_PROXY_SLOW_LOG_MS;
  });

  it("no-ops when disabled", () => {
    process.env.STREAM_PROXY_SLOW_LOG_DISABLED = "1";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    maybeLogStreamUpstreamSlow({
      requestId: "rid",
      durationMs: 99999,
      streamType: "hls",
      upstreamHost: "example.com",
      upstreamStatus: 200,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("no-ops below threshold", () => {
    process.env.STREAM_PROXY_SLOW_LOG_MS = "5000";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    maybeLogStreamUpstreamSlow({
      requestId: "rid",
      durationMs: 100,
      streamType: "hls",
      upstreamHost: "example.com",
      upstreamStatus: 200,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs one JSON line when over threshold", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    maybeLogStreamUpstreamSlow({
      requestId: "abc-123",
      durationMs: 3000,
      streamType: "vod",
      upstreamHost: "cdn.example",
      upstreamStatus: 502,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    const row = JSON.parse(line) as Record<string, unknown>;
    expect(row.event).toBe("stream_upstream_slow");
    expect(row.requestId).toBe("abc-123");
    expect(row.durationMs).toBe(3000);
    expect(row.upstreamHost).toBe("cdn.example");
    spy.mockRestore();
  });
});
