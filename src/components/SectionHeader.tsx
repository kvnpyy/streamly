"use client";

import { cn } from "@/lib/utils";

export function SectionHeader({
  eyebrow,
  title,
  description,
  right,
  className,
  /** Hide long helper copy on small screens — browse pages use horizontal category rails instead. */
  hideDescriptionOnMobile,
  /** Tighter hero for routes where the sticky bar already carries the primary control (e.g. Search). */
  compact,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
  className?: string;
  hideDescriptionOnMobile?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 sm:gap-4",
        compact ? "mb-2 sm:mb-4" : "mb-5",
        className
      )}
    >
      <div>
        {eyebrow && (
          <div
            className={cn(
              "text-[11px] uppercase tracking-[0.18em] text-(--brand-2) mb-1.5",
              compact && "hidden sm:block"
            )}
          >
            {eyebrow}
          </div>
        )}
        <h1
          className={cn(
            "font-semibold tracking-tight text-(--text) text-balance",
            compact
              ? "text-lg sm:text-2xl"
              : "text-2xl sm:text-3xl"
          )}
        >
          {title}
        </h1>
        {description && (
          <p
            className={cn(
              "text-sm text-(--text-dim) mt-1.5 max-w-2xl text-pretty text-balance",
              hideDescriptionOnMobile && "hidden md:block"
            )}
          >
            {description}
          </p>
        )}
      </div>
      {right && (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0 justify-start sm:justify-end">
          {right}
        </div>
      )}
    </div>
  );
}

export function SkeletonGrid({
  count = 12,
  variant = "poster",
}: {
  count?: number;
  variant?: "poster" | "tile";
}) {
  if (variant === "tile") {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="card p-3.5 flex items-start gap-4">
            <div className="skeleton size-16 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="skeleton h-3 w-1/3" />
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-1.5 w-full rounded-full" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="skeleton aspect-[2/3]" />
          <div className="p-3 space-y-2">
            <div className="skeleton h-3.5 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
