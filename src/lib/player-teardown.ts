/** Pause immediately; defer detach / resume I/O so close paints before heavy work (all clients). */

export type HlsTeardownTarget = {
  stopLoad(): void;
  destroy(): void;
} | null | undefined;

export function pauseVideoElement(video: HTMLVideoElement): void {
  try {
    video.pause();
  } catch {
    /* noop */
  }
}

export type ScheduleDeferredPlayerTeardownOptions = {
  defer?: boolean;
  maxWaitMs?: number;
};

/** Every client defers heavy teardown on close — TV, mobile WebViews, and desktop Chrome. */
export function shouldDeferPlayerCloseTeardown(): boolean {
  return true;
}

/** Stop fragment/manifest loading and destroy an hls.js instance (safe if already torn down). */
export function destroyHlsInstance(hls: HlsTeardownTarget): void {
  if (!hls) return;
  try {
    hls.stopLoad();
  } catch {
    /* noop */
  }
  try {
    hls.destroy();
  } catch {
    /* noop */
  }
}

type CloseHls = {
  stopLoad(): void;
  destroy(): void;
  bufferController?: {
    mediaSource?: MediaSource | null;
  } | null;
};

/**
 * hls.js detach calls `sourceBuffer.abort()`, `removeSourceBuffer()`,
 * `mediaSource.endOfStream()`, then `video.load()`. After a long live or VOD
 * session those walk an infinite-duration buffer and never return on Silk,
 * Tizen, and webOS — the tab stays dead until it is closed.
 * Stop the network, then let destroy drop JS listeners without touching MSE.
 */
export function destroyHlsAfterLongPlayback(
  hls: HlsTeardownTarget,
  video: HTMLVideoElement | null | undefined
): void {
  if (!hls) return;
  const restore = disarmMediaPipelineForClose(hls as CloseHls, video);
  try {
    destroyHlsInstance(hls);
  } finally {
    restore();
  }
  if (video) {
    try {
      video.removeAttribute("src");
    } catch {
      /* noop */
    }
  }
}

function disarmMediaPipelineForClose(
  hls: CloseHls,
  video: HTMLVideoElement | null | undefined
): () => void {
  const restores: Array<() => void> = [];
  const mediaSource = hls.bufferController?.mediaSource ?? null;
  if (mediaSource) {
    restores.push(replaceMethod(mediaSource, "endOfStream", () => {}));
    restores.push(replaceMethod(mediaSource, "removeSourceBuffer", () => {}));
    try {
      const buffers = mediaSource.sourceBuffers;
      for (let i = 0; i < buffers.length; i++) {
        const sb = buffers[i];
        if (sb) restores.push(replaceMethod(sb, "abort", () => {}));
      }
    } catch {
      /* noop */
    }
  }
  if (video) {
    restores.push(replaceMethod(video, "load", () => {}));
    try {
      video.removeAttribute("src");
    } catch {
      /* noop */
    }
  }
  return () => {
    for (const restore of restores) restore();
  };
}

function replaceMethod<T extends object, K extends keyof T>(
  target: T,
  key: K,
  next: T[K]
): () => void {
  const previous = target[key];
  try {
    target[key] = next;
  } catch {
    return () => {};
  }
  return () => {
    try {
      target[key] = previous;
    } catch {
      /* noop */
    }
  };
}

/**
 * Pause `<video>` and tear down hls.js immediately — used after fatal errors when a sync
 * stop is required before retry. Prefer deferred teardown on player close.
 */
export function eagerStopPlayerMedia(
  video: HTMLVideoElement | null | undefined,
  hls: HlsTeardownTarget
): void {
  if (video) pauseVideoElement(video);
  destroyHlsInstance(hls);
}

/** TV sleep / page freeze: pause and stop fragment fetches without destroying MSE. */
export function suspendPlayerMediaForBackground(
  video: HTMLVideoElement | null | undefined,
  hls: HlsTeardownTarget
): void {
  if (video) pauseVideoElement(video);
  if (!hls) return;
  try {
    hls.stopLoad();
  } catch {
    /* noop */
  }
}

/**
 * Run player teardown after the overlay can paint closed.
 * Returns cancel — call from effect cleanup if the player reopens before idle.
 */
export function scheduleDeferredPlayerTeardown(
  run: () => void,
  opts: ScheduleDeferredPlayerTeardownOptions = {}
): () => void {
  const { defer = shouldDeferPlayerCloseTeardown(), maxWaitMs = 180 } = opts;
  if (!defer) {
    run();
    return () => {};
  }

  let cancelled = false;
  const finish = () => {
    if (!cancelled) run();
  };

  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(finish, { timeout: maxWaitMs });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }

  const t = setTimeout(finish, 0);
  return () => {
    cancelled = true;
    clearTimeout(t);
  };
}

/**
 * Browse remount after player close — idle + timeout so it runs after sync hls teardown
 * and the close paint (same window as deferred detach).
 */
export function scheduleBrowseRemountAfterClose(
  onMount: () => void,
  opts: { maxWaitMs?: number } = {}
): () => void {
  const { maxWaitMs = 320 } = opts;
  let cancelled = false;
  const finish = () => {
    if (!cancelled) onMount();
  };

  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(finish, { timeout: maxWaitMs });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }

  if (typeof requestAnimationFrame !== "undefined") {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) finish();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }

  const t = setTimeout(finish, 0);
  return () => {
    cancelled = true;
    clearTimeout(t);
  };
}
