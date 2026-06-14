"use client";

import { scheduleWhenIdle } from "@/lib/defer-idle";
import { isLibraryHomePath } from "@/lib/home-route";
import { useEffect, useState } from "react";

/**
 * Tracks whether the first user gesture happened (or a long fallback elapsed).
 * See {@link useInteractionReady}.
 */
export function useInteractionReady(fallbackMs = 12_000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;

    const finish = () => setReady(true);

    window.addEventListener("pointerdown", finish, { once: true, passive: true });
    window.addEventListener("keydown", finish, { once: true });
    const fallback = window.setTimeout(finish, fallbackMs);

    return () => {
      window.removeEventListener("pointerdown", finish);
      window.removeEventListener("keydown", finish);
      window.clearTimeout(fallback);
    };
  }, [ready, fallbackMs]);

  return ready;
}

/** Defer heavy work longer on the library home route until idle + optional interaction. */
export function useLibraryHeavyWorkReady(
  interactionReady: boolean,
  idleMs = 2_500
): boolean {
  const [idleReady, setIdleReady] = useState(false);

  useEffect(() => {
    if (!interactionReady) {
      queueMicrotask(() => setIdleReady(false));
      return;
    }
    return scheduleWhenIdle(() => setIdleReady(true), idleMs);
  }, [interactionReady, idleMs]);

  return interactionReady && idleReady;
}

export function shouldDeferEpgHydrate(pathname?: string): boolean {
  if (typeof window === "undefined") return false;
  const path = pathname ?? window.location.pathname;
  return isLibraryHomePath(path);
}
