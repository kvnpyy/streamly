import { afterEach, describe, expect, it, vi } from "vitest";
import {
  destroyHlsInstance,
  eagerStopPlayerMedia,
  pauseVideoElement,
  scheduleDeferredPlayerTeardown,
  shouldDeferPlayerCloseTeardown,
} from "@/lib/player-teardown";

describe("shouldDeferPlayerCloseTeardown", () => {
  it("is always true so mobile and desktop get the same close path as TV", () => {
    expect(shouldDeferPlayerCloseTeardown()).toBe(true);
  });
});

describe("pauseVideoElement", () => {
  it("calls pause on the element", () => {
    const video = { pause: vi.fn() } as unknown as HTMLVideoElement;
    pauseVideoElement(video);
    expect(video.pause).toHaveBeenCalledOnce();
  });
});

describe("destroyHlsInstance", () => {
  it("stops load and destroys hls", () => {
    const hls = { stopLoad: vi.fn(), destroy: vi.fn() };
    destroyHlsInstance(hls);
    expect(hls.stopLoad).toHaveBeenCalledOnce();
    expect(hls.destroy).toHaveBeenCalledOnce();
  });

  it("no-ops on null", () => {
    expect(() => destroyHlsInstance(null)).not.toThrow();
  });
});

describe("eagerStopPlayerMedia", () => {
  it("pauses video and destroys hls", () => {
    const video = { pause: vi.fn() } as unknown as HTMLVideoElement;
    const hls = { stopLoad: vi.fn(), destroy: vi.fn() };
    eagerStopPlayerMedia(video, hls);
    expect(video.pause).toHaveBeenCalledOnce();
    expect(hls.destroy).toHaveBeenCalledOnce();
  });
});

describe("scheduleDeferredPlayerTeardown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs synchronously when defer is explicitly false", () => {
    const run = vi.fn();
    scheduleDeferredPlayerTeardown(run, { defer: false });
    expect(run).toHaveBeenCalledOnce();
  });

  it("defers by default", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    scheduleDeferredPlayerTeardown(run);
    expect(run).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(run).toHaveBeenCalledOnce();
  });

  it("defers when defer is true", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    scheduleDeferredPlayerTeardown(run, { defer: true });
    expect(run).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(run).toHaveBeenCalledOnce();
  });

  it("cancel prevents deferred run", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const cancel = scheduleDeferredPlayerTeardown(run, { defer: true });
    cancel();
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
  });
});
