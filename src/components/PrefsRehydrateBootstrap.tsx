"use client";

import { scheduleWhenIdle } from "@/lib/defer-idle";
import { usePrefs } from "@/store/preferences";
import { useEffect, type ReactNode } from "react";

/**
 * Defers reading `localStorage` prefs until idle so Library (/app) can paint first.
 * Requires `skipHydration: true` on the prefs store.
 */
export function PrefsRehydrateBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (usePrefs.persist.hasHydrated()) return;
    const cancel = scheduleWhenIdle(() => {
      void usePrefs.persist.rehydrate();
    }, 280);
    const force = window.setTimeout(() => {
      if (!usePrefs.persist.hasHydrated()) {
        void usePrefs.persist.rehydrate();
      }
    }, 4_000);
    return () => {
      cancel();
      window.clearTimeout(force);
    };
  }, []);

  return children;
}
