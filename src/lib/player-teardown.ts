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

/** Tab/TV hidden: pause and stop fragment fetches without destroying MSE. */
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
