/** Pause immediately; defer hls.destroy / detach so close paints before heavy work (all clients). */

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

/** Two animation frames — browse remount after player close paint (all clients). */
export function scheduleBrowseRemountAfterClose(onMount: () => void): () => void {
  if (typeof requestAnimationFrame === "undefined") {
    const t = setTimeout(onMount, 0);
    return () => clearTimeout(t);
  }
  let cancelled = false;
  let raf2 = 0;
  const raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => {
      if (!cancelled) onMount();
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf1);
    if (raf2) cancelAnimationFrame(raf2);
  };
}
