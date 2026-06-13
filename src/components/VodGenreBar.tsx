"use client";

import { LiveCategoryBrowseModal } from "@/components/LiveCategoryBrowseModal";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { pickGenreCategories } from "@/lib/vod-genre-discovery";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/xtream-types";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  categories: Category[];
  value: string | "all";
  onChange: (id: string | "all") => void;
  countById?: Record<string, number>;
  hideAdult?: boolean;
  /** Curated genre shortcuts in the dropdown (full list stays in “Browse all”). */
  featuredMax?: number;
};

export function VodGenreBar({
  categories,
  value,
  onChange,
  countById,
  hideAdult = false,
  featuredMax = 14,
}: Props) {
  const tvBrowser = useTvBrowser();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [browseAllOpen, setBrowseAllOpen] = useState(false);

  const featuredGenres = useMemo(
    () =>
      pickGenreCategories(categories, countById ?? {}, {
        max: featuredMax,
        hideAdult,
      }),
    [categories, countById, featuredMax, hideAdult]
  );

  const selectedLabel = useMemo(() => {
    if (value === "all") return "All Genres";
    const sid = String(value);
    return (
      categories.find((c) => String(c.category_id) === sid)?.category_name ||
      "Genre"
    );
  }, [value, categories]);

  const selectedCount =
    value === "all" ? undefined : countById?.[String(value)];

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const pickGenre = (id: string | "all") => {
    onChange(id);
    setMenuOpen(false);
  };

  const openPicker = () => {
    if (tvBrowser) {
      setBrowseAllOpen(true);
      return;
    }
    setMenuOpen((o) => !o);
  };

  if (categories.length === 0) return null;

  return (
    <>
      <div ref={rootRef} className="flex flex-wrap items-center gap-2 min-w-0">
        <div className="relative">
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            onClick={openPicker}
            className={cn(
              "inline-flex items-center gap-2 min-h-11 px-3.5 sm:px-4 rounded-lg text-sm font-semibold border transition-colors",
              "bg-(--bg-2) border-(--line) text-(--text) hover:border-(--brand)/45 hover:bg-(--bg-3)",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-0)",
              tvBrowser && "min-h-12 px-5 text-base",
              value !== "all" &&
                "border-(--brand)/40 bg-(--brand)/10 text-(--text) shadow-[0_0_20px_-10px_rgba(124,92,255,0.55)]"
            )}
          >
            <span className="truncate max-w-[min(58vw,14rem)] sm:max-w-[16rem]">
              {selectedLabel}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-(--text-muted) transition-transform",
                menuOpen && "rotate-180"
              )}
              aria-hidden
            />
          </button>

          {menuOpen && !tvBrowser && (
            <div
              role="listbox"
              aria-label="Genres"
              className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(100vw-1.5rem,20rem)] max-h-[min(60dvh,22rem)] overflow-y-auto rounded-xl border border-(--line) bg-(--bg-1) shadow-2xl py-1.5 scrollbar-hide"
            >
              <GenreOption
                active={value === "all"}
                label="All Genres"
                count={countById ? sumCounts(countById) : undefined}
                onPick={() => pickGenre("all")}
              />
              {featuredGenres.length > 0 && (
                <div
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)"
                  aria-hidden
                >
                  Popular genres
                </div>
              )}
              {featuredGenres.map((c) => {
                const id = String(c.category_id);
                return (
                  <GenreOption
                    key={id}
                    active={value !== "all" && String(value) === id}
                    label={c.category_name}
                    count={countById?.[id]}
                    onPick={() => pickGenre(id)}
                  />
                );
              })}
              <div className="my-1.5 border-t border-(--line)" />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setBrowseAllOpen(true);
                }}
                className="w-full text-left px-3 py-2.5 text-sm text-(--brand-2) hover:bg-(--bg-2) flex items-center gap-2 font-medium"
              >
                <LayoutGrid className="size-4 shrink-0 opacity-90" aria-hidden />
                Browse all categories…
              </button>
            </div>
          )}
        </div>

        {value !== "all" && typeof selectedCount === "number" && (
          <span className="text-xs text-(--text-muted) tabular-nums">
            {selectedCount.toLocaleString()}{" "}
            {selectedCount === 1 ? "title" : "titles"}
          </span>
        )}
      </div>

      <LiveCategoryBrowseModal
        open={browseAllOpen}
        onClose={() => setBrowseAllOpen(false)}
        categories={categories}
        value={value}
        countById={countById}
        onChange={onChange}
        title="Browse genres"
        subtitle="Search the full provider catalog — same list as your IPTV panel"
      />
    </>
  );
}

function GenreOption({
  active,
  label,
  count,
  onPick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onPick}
      className={cn(
        "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors",
        active
          ? "bg-(--brand)/12 text-(--text) font-medium"
          : "text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        {active ? (
          <Check className="size-3.5 shrink-0 text-(--brand-2)" aria-hidden />
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden />
        )}
        <span className="truncate">{label}</span>
      </span>
      {typeof count === "number" && (
        <span className="text-[11px] text-(--text-muted) tabular-nums shrink-0">
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

function sumCounts(countById: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(countById)) {
    if (Number.isFinite(v)) n += v;
  }
  return n;
}
