"use client";

import { TvCategoryGrid } from "@/components/tv/TvCategoryGrid";
import { TvFocusRoot } from "@/components/tv/TvFocusRoot";
import {
  buildNameSearchIndex,
  filterByNameQuery,
} from "@/lib/name-search-index";
import { TV_SIMPLE_CATEGORY_BATCH } from "@/lib/tv-simple-browse";
import type { Category } from "@/lib/xtream-types";
import { ArrowLeft, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

type TvLiveCategoryPickerProps = {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  countById?: Record<string, number>;
  onSelect: (id: string, title: string) => void;
};

/**
 * Full-screen TV category browser — paginated grid, no modal blur/virtualizer freeze.
 */
export function TvLiveCategoryPicker({
  open,
  onClose,
  categories,
  countById,
  onSelect,
}: TvLiveCategoryPickerProps) {
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter.trim().toLowerCase());
  const [visibleCount, setVisibleCount] = useState(TV_SIMPLE_CATEGORY_BATCH);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const body = bodyRef.current;
    if (!body) return;
    const onFocusIn = (e: FocusEvent) => {
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-tv-card-root]"
      );
      card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    body.addEventListener("focusin", onFocusIn);
    return () => body.removeEventListener("focusin", onFocusIn);
  }, [open]);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setFilter("");
        setVisibleCount(TV_SIMPLE_CATEGORY_BATCH);
      });
    }
  }, [open]);

  const categoryNameIndex = useMemo(
    () => buildNameSearchIndex(categories, (c) => c.category_name),
    [categories]
  );

  const filtered = useMemo(() => {
    if (!deferredFilter) return categories;
    return filterByNameQuery(categoryNameIndex, deferredFilter);
  }, [categories, categoryNameIndex, deferredFilter]);

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const gridItems = useMemo(
    () =>
      visible.map((c) => ({
        id: String(c.category_id),
        label: c.category_name,
        count: countById?.[String(c.category_id)],
      })),
    [visible, countById]
  );

  if (!open) return null;

  const hasMore = visible.length < filtered.length;
  const isFiltering = deferredFilter.length > 0;

  return (
    <TvFocusRoot autoFocus={false} className="tv-live-category-picker">
      <header className="tv-live-category-picker__header">
        <button
          type="button"
          data-tv-card-root
          onClick={onClose}
          className="tv-live-category-picker__back focus-ring"
          aria-label="Back to Live TV"
        >
          <ArrowLeft className="size-7 shrink-0" aria-hidden />
          <span>Live TV</span>
        </button>
        <h2 className="tv-live-category-picker__title">Categories</h2>
        <div className="tv-live-category-picker__search-wrap">
          <Search className="size-5 shrink-0 text-(--text-muted)" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setVisibleCount(TV_SIMPLE_CATEGORY_BATCH);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search categories…"
            className="tv-live-category-picker__search live-channel-search__input"
            aria-label="Search categories"
          />
          {filter ? (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="tv-live-category-picker__clear"
              aria-label="Clear search"
            >
              <X className="size-5" />
            </button>
          ) : null}
        </div>
      </header>

      <div ref={bodyRef} className="tv-live-category-picker__body">
        {categories.length === 0 ? (
          <p className="tv-live-category-picker__empty">No categories loaded yet.</p>
        ) : filtered.length === 0 ? (
          <p className="tv-live-category-picker__empty">
            No categories match &ldquo;{filter}&rdquo;.
          </p>
        ) : (
          <>
            <p className="tv-live-category-picker__meta">
              {isFiltering
                ? `${filtered.length} matching`
                : `${filtered.length} categories`}
            </p>
            <TvCategoryGrid
              items={gridItems}
              onSelect={(id) => {
                const cat = categories.find((c) => String(c.category_id) === id);
                if (!cat) return;
                onSelect(id, cat.category_name);
                onClose();
              }}
            />
            {hasMore ? (
              <button
                type="button"
                data-tv-card-root
                className="tv-live-category-picker__more focus-ring"
                onClick={() =>
                  setVisibleCount((n) => n + TV_SIMPLE_CATEGORY_BATCH)
                }
              >
                Show more categories
              </button>
            ) : null}
          </>
        )}
      </div>
    </TvFocusRoot>
  );
}
