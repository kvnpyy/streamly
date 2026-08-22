"use client";

import { scheduleWhenIdle } from "@/lib/defer-idle";
import { isLibraryHomePath } from "@/lib/home-route";
import { prefsHasHydrated, rehydratePrefs } from "@/lib/prefs-persist-api";
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
    if (prefsHasHydrated()) return;
    const idleMs = onLibraryHome ? 2_400 : 280;
    const cancel = scheduleWhenIdle(() => {
      rehydratePrefs();
    }, idleMs);
    const force = window.setTimeout(() => {
      if (!prefsHasHydrated()) {
        rehydratePrefs();
      }
    }, onLibraryHome ? 8_000 : 4_000);
    return () => {
      cancel();
      window.clearTimeout(force);
    };
  }, [onLibraryHome]);

  return children;
}
