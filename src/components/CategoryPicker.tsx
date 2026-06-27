"use client";

import {
  buildNameSearchIndex,
  filterByNameQuery,
} from "@/lib/name-search-index";
import { useDebouncedValue } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/xtream-types";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, FolderOpen } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type Entry = { id: string | "all"; label: string; count?: number };

/** Virtualize long IPTV category lists (500+ is common). */
const CATEGORY_VIRTUAL_MIN = 72;
const CATEGORY_ROW_PX = 40;

function CategoryOption({
  entry,
  active,
  tabIndex,
  onSelect,
  onKeyDown,
  onFocus,
  buttonRef,
}: {
  entry: Entry;
  active: boolean;
  tabIndex: number;
  onSelect: () => void;
  onKeyDown: (ev: KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="option"
      aria-selected={active}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className={cn(
        "w-full text-left text-sm px-3 py-2 rounded-lg flex items-center justify-between transition-colors",
        active
          ? "bg-(--bg-3) text-(--text)"
          : "text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
      )}
    >
      <span className="truncate">{entry.label}</span>
      {typeof entry.count === "number" && (
        <span className="text-[11px] text-(--text-muted)">{entry.count}</span>
      )}
    </button>
  );
}

function useCategoryListFocus(
  entries: Entry[],
  value: string | "all",
  onChange: (id: string | "all") => void
) {
  const selectedIndex = useMemo(() => {
    const i = entries.findIndex(
      (e) => (value === "all" && e.id === "all") || String(value) === e.id
    );
    return i >= 0 ? i : 0;
  }, [entries, value]);

  const [bias, setBias] = useState(0);
  const focusIndex = Math.max(
    0,
    Math.min(selectedIndex + bias, entries.length - 1)
  );

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusAt = useCallback(
    (i: number) => {
      const max = entries.length - 1;
      const clamped = Math.max(0, Math.min(i, max));
      setBias(clamped - selectedIndex);
      queueMicrotask(() => itemRefs.current[clamped]?.focus());
      return clamped;
    },
    [entries.length, selectedIndex]
  );

  const activateIndex = useCallback(
    (i: number) => {
      const e = entries[i];
      if (!e) return;
      onChange(e.id === "all" ? "all" : e.id);
    },
    [entries, onChange]
  );

  const onOptionKeyDown = useCallback(
    (index: number, ev: KeyboardEvent<HTMLButtonElement>) => {
      switch (ev.key) {
        case "ArrowDown":
          ev.preventDefault();
          focusAt(index + 1);
          break;
        case "ArrowUp":
          ev.preventDefault();
          focusAt(index - 1);
          break;
        case "Home":
          ev.preventDefault();
          focusAt(0);
          break;
        case "End":
          ev.preventDefault();
          focusAt(entries.length - 1);
          break;
        case "Enter":
        case " ":
          ev.preventDefault();
          activateIndex(index);
          break;
        default:
          break;
      }
    },
    [activateIndex, entries.length, focusAt]
  );

  return {
    selectedIndex,
    focusIndex,
    itemRefs,
    focusAt,
    activateIndex,
    onOptionKeyDown,
    setBias,
  };
}

function CategoryListBody({
  entries,
  value,
  onChange,
  listWrapperClassName,
}: {
  entries: Entry[];
  value: string | "all";
  onChange: (id: string | "all") => void;
  listWrapperClassName?: string;
}) {
  const {
    selectedIndex,
    focusIndex,
    itemRefs,
    onOptionKeyDown,
    setBias,
  } = useCategoryListFocus(entries, value, onChange);

  return (
    <div
      className={cn(
        "mt-2 overflow-y-auto pr-1 -mr-1 space-y-0.5 min-h-0",
        listWrapperClassName
      )}
      role="listbox"
      aria-label="Category list"
      data-category-roving
    >
      {entries.map((e, index) => {
        const active =
          value === "all"
            ? e.id === "all"
            : String(value) === String(e.id);
        return (
          <CategoryOption
            key={e.id === "all" ? "all" : e.id}
            entry={e}
            active={active}
            tabIndex={index === focusIndex ? 0 : -1}
            buttonRef={(el) => {
              itemRefs.current[index] = el;
            }}
            onSelect={() => {
              setBias(index - selectedIndex);
              onChange(e.id === "all" ? "all" : e.id);
            }}
            onKeyDown={(ev) => onOptionKeyDown(index, ev)}
            onFocus={() => setBias(index - focusIndex)}
          />
        );
      })}
    </div>
  );
}

function VirtualCategoryListBody({
  entries,
  value,
  onChange,
  listWrapperClassName,
}: {
  entries: Entry[];
  value: string | "all";
  onChange: (id: string | "all") => void;
  listWrapperClassName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    selectedIndex,
    focusIndex,
    itemRefs,
    activateIndex,
    onOptionKeyDown,
    setBias,
  } = useCategoryListFocus(entries, value, onChange);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CATEGORY_ROW_PX,
    overscan: 10,
  });

  useLayoutEffect(() => {
    if (selectedIndex > 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedIndex, value, virtualizer]);

  useEffect(() => {
    const el = itemRefs.current[focusIndex];
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIndex, itemRefs]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "mt-2 overflow-y-auto pr-1 -mr-1 min-h-0",
        listWrapperClassName
      )}
      role="listbox"
      aria-label="Category list"
      data-category-roving
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const e = entries[vi.index];
          if (!e) return null;
          const index = vi.index;
          const active =
            value === "all"
              ? e.id === "all"
              : String(value) === String(e.id);
          return (
            <div
              key={vi.key}
              className="absolute left-0 w-full box-border px-0 py-0.5"
              style={{
                top: 0,
                transform: `translateY(${vi.start}px)`,
                minHeight: vi.size,
              }}
            >
              <CategoryOption
                entry={e}
                active={active}
                tabIndex={index === focusIndex ? 0 : -1}
                buttonRef={(el) => {
                  itemRefs.current[index] = el;
                }}
                onSelect={() => {
                  setBias(index - selectedIndex);
                  activateIndex(index);
                }}
                onKeyDown={(ev) => onOptionKeyDown(index, ev)}
                onFocus={() => setBias(index - selectedIndex)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  countById,
  layout = "sidebar",
}: {
  categories: Category[];
  value: string | "all";
  onChange: (id: string | "all") => void;
  countById?: Record<string, number>;
  layout?: "sidebar" | "dialog";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, 120);
  const categoryNameIndex = useMemo(
    () => buildNameSearchIndex(categories, (c) => c.category_name),
    [categories]
  );
  const filtered = useMemo(() => {
    const f = debouncedFilter.trim().toLowerCase();
    if (!f) return categories;
    return filterByNameQuery(categoryNameIndex, f);
  }, [categories, categoryNameIndex, debouncedFilter]);

  const entries: Entry[] = useMemo(
    () => [
      { id: "all", label: "All" },
      ...filtered.map((c) => {
        const id = String(c.category_id);
        return {
          id,
          label: c.category_name,
          count: countById?.[id],
        };
      }),
    ],
    [filtered, countById]
  );

  const entryKeys = entries.map((e) => e.id).join("\u001f");
  const listKey = `${value}\u0000${entryKeys}`;
  const useVirtual = entries.length >= CATEGORY_VIRTUAL_MIN;
  const ListBody = useVirtual ? VirtualCategoryListBody : CategoryListBody;

  return (
    <div
      ref={rootRef}
      className={cn(
        "card p-3 flex flex-col min-h-0 transition-[box-shadow,border-color]",
        layout === "dialog"
          ? "max-h-full h-full w-full rounded-xl shadow-none bg-(--bg-2)"
          : "sticky top-[68px] max-h-[calc(100vh-100px)]",
        value !== "all" &&
          "ring-2 ring-(--brand)/35 border-(--brand)/35 shadow-[0_0_24px_-8px_rgba(124,92,255,0.35)]"
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-xs uppercase tracking-wider text-(--text-muted) shrink-0">
            Categories
          </div>
          {value !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-(--brand)/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--brand-2) border border-(--brand)/25 truncate max-w-[12rem]">
              <FolderOpen className="size-3 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">Filtered</span>
            </span>
          )}
        </div>
        <ChevronDown className="size-3.5 text-(--text-muted) shrink-0" aria-hidden />
      </div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            setFilter("");
          }
          if (e.key === "ArrowDown" && entries.length > 0) {
            e.preventDefault();
            const first = rootRef.current?.querySelector(
              "[data-category-roving] button"
            ) as HTMLButtonElement | null;
            first?.focus();
          }
        }}
        placeholder="Filter…"
        aria-label="Filter categories"
        autoFocus={layout === "dialog"}
        className="w-full bg-(--bg-3) border border-(--line) rounded-lg px-3 h-9 text-sm outline-none focus:border-(--brand)/50"
      />
      <ListBody
        key={listKey}
        entries={entries}
        value={value}
        onChange={onChange}
        listWrapperClassName={layout === "dialog" ? "flex-1 min-h-[160px]" : undefined}
      />
    </div>
  );
}
