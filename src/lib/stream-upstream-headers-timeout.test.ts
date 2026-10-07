import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHeadersTimeoutSignal,
  fetchWithHeadersTimeout,
  streamProxyHeadersTimeoutMs,
} from "./stream-upstream-headers-timeout";

describe("streamProxyHeadersTimeoutMs", () => {
  afterEach(() => {
    delete process.env.STREAM_PROXY_HEADERS_TIMEOUT_MS;
  });

  it("defaults to 15s", () => {
    expect(streamProxyHeadersTimeoutMs()).toBe(15_000);
  });

  it("parses an override and clamps it", () => {
    process.env.STREAM_PROXY_HEADERS_TIMEOUT_MS = "8000";
    expect(streamProxyHeadersTimeoutMs()).toBe(8000);
    process.env.STREAM_PROXY_HEADERS_TIMEOUT_MS = "999999";
    expect(streamProxyHeadersTimeoutMs()).toBe(60_000);
    process.env.STREAM_PROXY_HEADERS_TIMEOUT_MS = "nope";
    expect(streamProxyHeadersTimeoutMs()).toBe(15_000);
  });
});

describe("createHeadersTimeoutSignal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts only after the headers deadline", async () => {
    vi.useFakeTimers();
    const { signal, cancelTimeout } = createHeadersTimeoutSignal(undefined, 1000);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    cancelTimeout();
  });

  it("does not abort after the deadline is cancelled", async () => {
    vi.useFakeTimers();
    const { signal, cancelTimeout } = createHeadersTimeoutSignal(undefined, 1000);
    cancelTimeout();
    await vi.advanceTimersByTimeAsync(5000);
    expect(signal.aborted).toBe(false);
  });

  it("follows the client abort signal", () => {
    const client = new AbortController();
    const { signal, cancelTimeout } = createHeadersTimeoutSignal(client.signal, 60_000);
    client.abort();
    expect(signal.aborted).toBe(true);
    cancelTimeout();
  });
});

describe("fetchWithHeadersTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels the deadline once headers arrive", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => new Response("ok"));
    const pending = fetchWithHeadersTimeout(
      "https://example.test/seg",
      {},
      1000,
      fetchImpl as unknown as typeof fetch
    );
    await vi.advanceTimersByTimeAsync(0);
    const res = await pending;
    expect(res.status).toBe(200);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects when headers never arrive", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const fail = () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init.signal?.aborted) fail();
        else init.signal?.addEventListener("abort", fail, { once: true });
      });
    });
    const pending = fetchWithHeadersTimeout(
      "https://example.test/slow",
      {},
      1000,
      fetchImpl as unknown as typeof fetch
    );
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
