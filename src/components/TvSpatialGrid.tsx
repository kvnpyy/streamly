"use client";

import { useTvBrowser } from "@/components/TvBrowserProvider";
import { pickSpatialFocus, type SpatialDir } from "@/lib/tv-spatial-nav";
import { cn } from "@/lib/utils";
import { type HTMLAttributes, useEffect, useRef } from "react";

export type TvSpatialGridProps = HTMLAttributes<HTMLDivElement>;

export function TvSpatialGrid({
  className,
  children,
  ...rest
}: TvSpatialGridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tv = useTvBrowser();

  useEffect(() => {
    if (!tv) return;
    const root = ref.current;
    if (!root) return;

    const dirFromKey = (k: string): SpatialDir | null => {
      if (k === "ArrowLeft") return "left";
      if (k === "ArrowRight") return "right";
      if (k === "ArrowUp") return "up";
      if (k === "ArrowDown") return "down";
      return null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const dir = dirFromKey(e.key);
      if (!dir) return;

      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) return;
      if (active.closest("input, textarea, select, [contenteditable=true]")) {
        return;
      }

      const currentCard = active.closest<HTMLElement>("[data-tv-card-root]");
      if (!currentCard || !root.contains(currentCard)) return;

      // Horizontal navigation within a shelf row is handled by TvShelf itself
      // (sibling traversal). Let it through so TvShelf's listener can act.
      if (
        (dir === "left" || dir === "right") &&
        currentCard.closest("[data-tv-shelf-row]")
      ) {
        return;
      }

      const curRect = currentCard.getBoundingClientRect();
      const curCy = curRect.top + curRect.height / 2;

      /**
       * Performance: do NOT query the entire grid — only cards within ±1.5 viewport
       * heights vertically. This limits candidates to ~3-4 visible shelves (~100-150
       * cards) instead of thousands. Horizontally-scrolled-but-nearby cards in the
       * same shelf always qualify (|ey - curCy| ≈ 0).
       *
       * Also skip getComputedStyle — it forces a style recalculation per element.
       * Checking rect dimensions is sufficient and much cheaper.
       */
      const vRange = window.innerHeight * 1.5;

      const candidates = Array.from(
        root.querySelectorAll<HTMLElement>("[data-tv-card-root]")
      ).filter((el) => {
        if (el === currentCard) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        // Limit vertical search radius — cards far offscreen are irrelevant
        const ey = r.top + r.height / 2;
        return Math.abs(ey - curCy) < vRange;
      });

      if (candidates.length === 0) return;

      const next = pickSpatialFocus(currentCard, candidates, dir);
      if (next) {
        e.preventDefault();
        next.focus();
        // Scroll the focused element into view if it's off-screen vertically
        next.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };

    root.addEventListener("keydown", onKeyDown, true);
    return () => root.removeEventListener("keydown", onKeyDown, true);
  }, [tv]);

  return (
    <div ref={ref} className={cn(className)} {...rest}>
      {children}
    </div>
  );
}
