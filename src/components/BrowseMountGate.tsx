"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Unmount browse UI while the player is open (saves TV RAM).
 * Remount one frame after close so media teardown and history cleanup finish first.
 */
export function BrowseMountGate({
  frozen,
  children,
}: {
  frozen: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(!frozen);

  useEffect(() => {
    if (frozen) {
      queueMicrotask(() => setMounted(false));
      return;
    }
    const id = window.requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [frozen]);

  if (!mounted) return null;
  return <>{children}</>;
}
