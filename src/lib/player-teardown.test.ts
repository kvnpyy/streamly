import { afterEach, describe, expect, it, vi } from "vitest";
import {
  destroyHlsAfterLongPlayback,
  destroyHlsInstance,
  eagerStopPlayerMedia,
  pauseVideoElement,
  scheduleDeferredPlayerTeardown,
  shouldDeferPlayerCloseTeardown,
  suspendPlayerMediaForBackground,
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

describe("destroyHlsAfterLongPlayback", () => {
  it("stops the network and skips the MSE flush that hangs TV browsers", () => {
    const load = vi.fn();
    const abort = vi.fn();
    const endOfStream = vi.fn();
    const removeSourceBuffer = vi.fn();
    const sourceBuffer = { abort };
    const mediaSource = {
      sourceBuffers: [sourceBuffer],
      endOfStream,
      removeSourceBuffer,
    };
    const video = {
      pause: vi.fn(),
      load,
      removeAttribute: vi.fn(),
      src: "blob:http://tv/session",
    } as unknown as HTMLVideoElement;
    const hls = {
      stopLoad: vi.fn(),
      bufferController: { mediaSource: mediaSource as unknown as MediaSource },
      destroy() {
        sourceBuffer.abort();
        mediaSource.removeSourceBuffer(sourceBuffer);
        mediaSource.endOfStream();
        video.load();
      },
    };

    destroyHlsAfterLongPlayback(hls, video);

    expect(hls.stopLoad).toHaveBeenCalledOnce();
    expect(abort).not.toHaveBeenCalled();
    expect(removeSourceBuffer).not.toHaveBeenCalled();
    expect(endOfStream).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
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

describe("suspendPlayerMediaForBackground", () => {
  it("pauses video and stops hls load without destroying", () => {
    const video = { pause: vi.fn() } as unknown as HTMLVideoElement;
    const hls = { stopLoad: vi.fn(), destroy: vi.fn() };
    suspendPlayerMediaForBackground(video, hls);
    expect(video.pause).toHaveBeenCalledOnce();
    expect(hls.stopLoad).toHaveBeenCalledOnce();
    expect(hls.destroy).not.toHaveBeenCalled();
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
