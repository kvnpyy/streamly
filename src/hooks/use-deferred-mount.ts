"use client";

import { scheduleWhenIdle } from "@/lib/defer-idle";
import { useEffect, useState } from "react";

/**
 * Gate heavy UI until after first paint + idle. `maxWaitMs` forces readiness so
 * the page never stays on a placeholder forever on busy main threads.
 */
export function useDeferredMount(
  idleMs = 120,
  maxWaitMs = 2_400
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setReady(true);
    };

    const cancelIdle = scheduleWhenIdle(finish, idleMs);
    const force = window.setTimeout(finish, maxWaitMs);

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        /* noop — ensures at least one paint before idle work */
      });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      window.clearTimeout(force);
      cancelAnimationFrame(raf);
    };
  }, [idleMs, maxWaitMs]);

  return ready;
}
