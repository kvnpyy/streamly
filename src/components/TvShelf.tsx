"use client";

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { memo, type ReactNode, useEffect, useRef } from "react";

export type TvShelfProps = {
  /** Row heading. */
  title: string;
  children: ReactNode;
  /** href for a full-page navigation (uses Next Link). */
  seeAllHref?: string;
  /** Opens an overlay instead of navigating. */
  onSeeAll?: () => void;
  /**
   * When provided, a prominent "+N more" button is rendered to the RIGHT of
   * the scroll area — always visible, always focusable. ArrowRight from the
   * last channel card moves focus here so TV users always have a clear
   * "there is more" affordance.
   */
  moreCount?: number;
  className?: string;
  /** Hide the built-in row title (parent provides section chrome). */
  hideTitle?: boolean;
};

/**
 * A single horizontal shelf row — one category of channels.
 *
 * Samsung-Internet compat notes:
 *  - Uses direct scrollLeft mutation (not scrollIntoView) for focusin.
 *  - horizontal D-pad handled via DOM sibling traversal (no getBoundingClientRect).
 *  - The "More" button sits OUTSIDE the scroll container so it is always visible.
 */
export const TvShelf = memo(function TvShelf({
  title,
  children,
  seeAllHref,
  onSeeAll,
  moreCount,
  className,
  hideTitle = false,
}: TvShelfProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const moreLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    /** Scroll to keep focused card visible. */
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const card = target.closest("[data-tv-card-root]") as HTMLElement | null;
      if (!card || !container.contains(card)) return;

      const cRect = container.getBoundingClientRect();
      const kRect = card.getBoundingClientRect();
      const PADDING = 24;

      if (kRect.left < cRect.left + PADDING) {
        container.scrollLeft += kRect.left - cRect.left - PADDING;
      } else if (kRect.right > cRect.right - PADDING) {
        container.scrollLeft += kRect.right - cRect.right + PADDING;
      }
    };

    /**
     * Horizontal D-pad navigation.
     * TvSpatialGrid skips left/right for [data-tv-shelf-row] elements, so
     * this listener is the sole handler for horizontal keys inside a shelf.
     * When ArrowRight is pressed on the LAST card, focus jumps to the "More"
     * button (rendered outside the scroll container) if one exists.
     */
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      const card = active.closest<HTMLElement>("[data-tv-card-root]");
      if (!card || !container.contains(card)) return;

      const cards = Array.from(
        container.querySelectorAll<HTMLElement>("[data-tv-card-root]")
      );
      const idx = cards.indexOf(card);
      if (idx === -1) return;

      const next = e.key === "ArrowRight" ? cards[idx + 1] : cards[idx - 1];
      if (next) {
        e.preventDefault();
        next.focus();
        return;
      }

      // Last card + ArrowRight → jump to the "More" button
      if (e.key === "ArrowRight") {
        const moreEl = moreBtnRef.current ?? moreLinkRef.current;
        if (moreEl) {
          e.preventDefault();
          moreEl.focus();
        }
      }
    };

    container.addEventListener("focusin", onFocusIn);
    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const hasSeeAll = seeAllHref ?? onSeeAll;
  const moreAction = onSeeAll ?? (seeAllHref ? undefined : undefined);

  // Shared classes for the external "More" button / link
  const moreClasses = cn(
    "flex-shrink-0 flex flex-col items-center justify-center gap-1.5",
    "w-[4.5rem] self-stretch rounded-2xl",
    "border border-(--line) bg-(--bg-2)/70",
    "text-(--text-dim) cursor-pointer select-none",
    "transition-all duration-150 outline-none",
    "hover:border-(--brand)/50 hover:bg-(--brand)/10 hover:text-(--brand)",
    "focus-visible:border-(--brand)/70 focus-visible:bg-(--brand)/15 focus-visible:text-(--brand)",
    "focus-visible:shadow-[0_0_0_3px_rgba(124,92,255,0.55)]",
    // vertically match the scroll container's pb-3
    "mb-3"
  );

  return (
    <div className={cn("space-y-3", className)}>
      {/* ── Shelf header ── */}
      <div
        className={cn(
          "flex items-center justify-between px-1",
          hideTitle && "sr-only"
        )}
      >
        <h2 className="text-lg font-bold text-(--text) tracking-tight">
          {title || "Shelf"}
        </h2>
        {hasSeeAll &&
          !hideTitle &&
          (seeAllHref ? (
            <Link
              href={seeAllHref}
              data-tv-card-root
              className="flex items-center gap-1.5 text-base text-(--text-dim) hover:text-(--brand) transition-colors rounded-xl px-3 py-1.5 border border-transparent hover:border-(--line) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50"
            >
              See all
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onSeeAll}
              data-tv-card-root
              className="flex items-center gap-1.5 text-base text-(--text-dim) hover:text-(--brand) transition-colors rounded-xl px-3 py-1.5 border border-transparent hover:border-(--line) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50"
            >
              See all
              <ChevronRight className="size-4" />
            </button>
          ))}
      </div>

      {/* ── Scroll row + external More button ── */}
      <div className="flex items-stretch gap-2">
        {/* Horizontal scroll container */}
        <div
          ref={scrollRef}
          data-tv-shelf-row
          className="flex-1 min-w-0 flex gap-3 pb-3 scrollbar-hide tv-shelf-scroll"
          style={{
            overflowX: "auto",
            overflowY: "visible",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x",
          }}
        >
          {children}
        </div>

        {/*
         * Always-visible "More" button — sits to the right of the scroll area.
         * Never scrolls away. TV users see it immediately and can navigate to
         * it by pressing ArrowRight from the last channel card.
         */}
        {(onSeeAll || seeAllHref) &&
          (seeAllHref ? (
            <Link
              ref={moreLinkRef}
              href={seeAllHref}
              data-tv-card-root
              aria-label={`See all in ${title}`}
              className={moreClasses}
            >
              {typeof moreCount === "number" && moreCount > 0 ? (
                <>
                  <span className="text-sm font-bold text-(--brand) leading-none">
                    +{moreCount}
                  </span>
                  <ChevronRight className="size-5" />
                </>
              ) : (
                <ChevronRight className="size-6" />
              )}
            </Link>
          ) : (
            <button
              ref={moreBtnRef}
              type="button"
              onClick={moreAction ?? onSeeAll}
              data-tv-card-root
              aria-label={`See all in ${title}`}
              className={moreClasses}
            >
              {typeof moreCount === "number" && moreCount > 0 ? (
                <>
                  <span className="text-sm font-bold text-(--brand) leading-none">
                    +{moreCount}
                  </span>
                  <ChevronRight className="size-5" />
                </>
              ) : (
                <ChevronRight className="size-6" />
              )}
            </button>
          ))}
      </div>
    </div>
  );
});
