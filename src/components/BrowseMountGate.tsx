"use client";

import { scheduleBrowseRemountAfterClose } from "@/lib/player-teardown";
import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Unmount browse UI while the player is open (saves TV RAM).
 * Remount is deferred by two frames on close so player teardown can paint first —
 * synchronous remount + hls.destroy on the same tick freezes TV, mobile, and desktop browsers.
 */
export function BrowseMountGate({
  frozen,
  children,
}: {
  frozen: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(!frozen);
  const cycleRef = useRef(0);

  useLayoutEffect(() => {
    const cycle = ++cycleRef.current;
    if (frozen) {
      if (cycleRef.current === cycle) setMounted(false);
    }
  }, [frozen]);

  useEffect(() => {
    if (frozen) return;
    const cycle = ++cycleRef.current;
    return scheduleBrowseRemountAfterClose(() => {
      if (cycleRef.current === cycle) setMounted(true);
    });
  }, [frozen]);

  if (!mounted) return null;
  return <>{children}</>;
}
