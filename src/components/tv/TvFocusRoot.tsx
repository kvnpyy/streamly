"use client";

import { useTvBrowser } from "@/components/TvBrowserProvider";
import { isTextInputTarget } from "@/lib/is-text-input-target";
import { cn } from "@/lib/utils";
import { type ReactNode, useEffect, useRef } from "react";

type TvFocusRootProps = {
  children: ReactNode;
  className?: string;
  /** Auto-focus the first focusable tile when this view opens. */
  autoFocus?: boolean;
};

/**
 * Living-room focus helper: highlights the D-pad / smart-cursor target and
 * focuses the first tile when a TV screen opens.
 */
export function TvFocusRoot({
  children,
  className,
  autoFocus = true,
}: TvFocusRootProps) {
  const ref = useRef<HTMLDivElement>(null);
  const didAutoFocusRef = useRef(false);
  const tv = useTvBrowser();

  useEffect(() => {
    if (!tv || !autoFocus || didAutoFocusRef.current) return;
    const root = ref.current;
    if (!root) return;

    const id = window.requestAnimationFrame(() => {
      if (isTextInputTarget(document.activeElement)) return;
      const first = root.querySelector<HTMLElement>(
        '[data-tv-card-root]:not([disabled])'
      );
      if (first && document.activeElement !== first) {
        first.focus({ preventScroll: true });
        didAutoFocusRef.current = true;
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [tv, autoFocus]);

  useEffect(() => {
    if (!tv) return;
    const root = ref.current;
    if (!root) return;

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-tv-card-root]")) return;
      root
        .querySelectorAll("[data-tv-focused]")
        .forEach((el) => el.removeAttribute("data-tv-focused"));
      const card = target.closest<HTMLElement>("[data-tv-card-root]");
      card?.setAttribute("data-tv-focused", "true");
    };

    root.addEventListener("focusin", onFocusIn, true);
    return () => root.removeEventListener("focusin", onFocusIn, true);
  }, [tv]);

  return (
    <div ref={ref} className={cn("tv-focus-root", className)}>
      {children}
    </div>
  );
}
