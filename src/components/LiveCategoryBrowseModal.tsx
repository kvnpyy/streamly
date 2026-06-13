"use client";

import { CategoryPicker } from "@/components/CategoryPicker";
import type { Category } from "@/lib/xtream-types";
import { Layers, X } from "lucide-react";
import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  value: string | "all";
  onChange: (id: string | "all") => void;
  countById?: Record<string, number>;
  title?: string;
  subtitle?: string;
};

/**
 * Mobile / touch: searchable grid of categories (like a mini portal) instead
 * of endless horizontal chips alone.
 */
export function LiveCategoryBrowseModal({
  open,
  onClose,
  categories,
  value,
  onChange,
  countById,
  title = "Browse categories",
  subtitle = "Search and pick a group — same as the desktop sidebar",
}: Props) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/72 backdrop-blur-[2px]"
        aria-label="Close category browser"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg sm:max-w-xl flex flex-col max-h-[min(88dvh,720px)] rounded-t-2xl sm:rounded-2xl border border-(--line) bg-(--bg-1) shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-(--line) bg-(--bg-2) shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="size-4 text-(--brand-2) shrink-0" aria-hidden />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-(--text)">{title}</div>
              <div className="text-[11px] text-(--text-muted)">{subtitle}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 inline-flex size-10 items-center justify-center rounded-xl border border-(--line) bg-(--bg-3) text-(--text) hover:border-(--brand)/40"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 p-3 sm:p-4 flex flex-col overflow-hidden">
          <CategoryPicker
            layout="dialog"
            categories={categories}
            value={value}
            countById={countById}
            onChange={(id) => {
              onChange(id);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
