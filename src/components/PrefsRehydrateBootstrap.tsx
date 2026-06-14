"use client";

import { scheduleWhenIdle } from "@/lib/defer-idle";
import { isLibraryHomePath } from "@/lib/home-route";
import { usePrefs } from "@/store/preferences";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * Defers reading `localStorage` prefs until idle so Library (/app) can paint first.
 * Requires `skipHydration: true` on the prefs store.
 */
export function PrefsRehydrateBootstrap({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onLibraryHome = isLibraryHomePath(pathname);

  useEffect(() => {
    if (usePrefs.persist.hasHydrated()) return;
    const idleMs = onLibraryHome ? 2_400 : 280;
    const cancel = scheduleWhenIdle(() => {
      void usePrefs.persist.rehydrate();
    }, idleMs);
    const force = window.setTimeout(() => {
      if (!usePrefs.persist.hasHydrated()) {
        void usePrefs.persist.rehydrate();
      }
    }, onLibraryHome ? 8_000 : 4_000);
    return () => {
      cancel();
      window.clearTimeout(force);
    };
  }, [onLibraryHome]);

  return children;
}
