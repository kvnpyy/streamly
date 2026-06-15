"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Unmount browse UI while the player is open (saves TV RAM).
 * Remount synchronously on close so continue-watching taps are never dropped.
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
      return;
    }
    if (cycleRef.current === cycle) setMounted(true);
  }, [frozen]);

  if (!mounted) return null;
  return <>{children}</>;
}
