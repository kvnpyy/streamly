"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type HorizontalShelfScrollProps = {
  children: ReactNode;
  className?: string;
};

/** Desktop shelf row with snap scrolling and hover arrow controls. */
export function HorizontalShelfScroll({
  children,
  className,
}: HorizontalShelfScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const refresh = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({
      left: el.scrollLeft > 8,
      right: max > 8 && el.scrollLeft < max - 8,
    });
  }, []);

  useEffect(() => {
    refresh();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(refresh);
    ro.observe(el);
    return () => ro.disconnect();
  }, [refresh, children]);

  const nudge = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const delta = Math.max(240, Math.round(el.clientWidth * 0.72)) * dir;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <div className={cn("relative group/shelf", className)}>
      {edge.left && (
        <button
          type="button"
          aria-label="Scroll shelf left"
          onClick={() => nudge(-1)}
          className="hidden md:grid absolute left-1 top-1/2 -translate-y-1/2 z-10 size-9 place-items-center rounded-full bg-(--bg-1)/90 border border-(--line) text-(--text) opacity-0 group-hover/shelf:opacity-100 group-focus-within/shelf:opacity-100 hover:bg-(--bg-2) shadow-lg transition-opacity"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      {edge.right && (
        <button
          type="button"
          aria-label="Scroll shelf right"
          onClick={() => nudge(1)}
          className="hidden md:grid absolute right-1 top-1/2 -translate-y-1/2 z-10 size-9 place-items-center rounded-full bg-(--bg-1)/90 border border-(--line) text-(--text) opacity-0 group-hover/shelf:opacity-100 group-focus-within/shelf:opacity-100 hover:bg-(--bg-2) shadow-lg transition-opacity"
        >
          <ChevronRight className="size-5" />
        </button>
      )}
      <div
        ref={ref}
        onScroll={refresh}
        className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory scroll-smooth"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {children}
      </div>
    </div>
  );
}
