"use client";

import { cn } from "@/lib/utils";
import { Filter, X } from "lucide-react";

type Props = {
  categoryName: string;
  /** Items currently visible with this filter (optional). */
  count?: number;
  countLabel: string;
  onClear: () => void;
  className?: string;
  eyebrow?: string;
  clearLabel?: string;
};

export function ActiveCategoryFilterBar({
  categoryName,
  count,
  countLabel,
  onClear,
  className,
  eyebrow = "Category filter on",
  clearLabel = "All categories",
}: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-(--brand)/30 bg-(--brand)/8 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-(--brand)/18 text-(--brand-2)">
        <Filter className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-(--brand-2)">
          {eyebrow}
        </div>
        <div className="mt-0.5 text-base font-semibold tracking-tight text-(--text) line-clamp-2 break-words min-w-0">
          {categoryName}
        </div>
      </div>
      {typeof count === "number" && (
        <div className="rounded-lg bg-(--bg-2) border border-(--line) px-2.5 py-1 text-xs tabular-nums text-(--text-dim)">
          <span className="font-semibold text-(--text)">{count}</span>
          {" · "}
          {countLabel}
        </div>
      )}
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-(--line) bg-(--bg-2) px-3 py-2 text-xs font-medium text-(--text) transition-colors hover:border-(--brand)/45 hover:bg-(--bg-3)"
      >
        <X className="size-3.5 opacity-80" aria-hidden />
        {clearLabel}
      </button>
    </div>
  );
}
