"use client";

import type { Category } from "@/lib/xtream-types";
import {
  defaultManualOrderFromCategories,
  getLiveCategorySortOptions,
  orderedLiveCategories,
  type LiveCategorySortMode,
} from "@/lib/live-category-sort";
import { looksAdult } from "@/lib/utils";
import { liveCatalogQueryOptions } from "@/lib/live-catalog-query";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { useAuth } from "@/store/auth";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ListOrdered, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useMemo, type ReactNode } from "react";

function SortModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "px-3 py-2 rounded-lg bg-(--brand)/20 border border-(--brand)/35 text-xs font-semibold text-(--text)"
          : "px-3 py-2 rounded-lg border border-(--line) bg-(--bg-3) text-xs text-(--text-dim) hover:border-(--line-2) hover:text-(--text)"
      }
    >
      {children}
    </button>
  );
}

/** Settings: how live category chips / picker are ordered per Xtream login. */
export function LiveCategorySortSection() {
  const creds = useAuth((s) => s.creds);
  const accountKey = useMemo(
    () => (creds ? browseAccountKey(creds) : ""),
    [creds]
  );
  const hideAdult = usePrefs((s) => s.hideAdult);
  const parentalUnlocked = usePrefs((s) => s.parentalUnlocked);
  const browseByAccount = usePrefs((s) => s.browseByAccount);
  const setBrowsePref = usePrefs((s) => s.setBrowsePref);

  const catalog = useQuery({
    ...liveCatalogQueryOptions(creds!),
    enabled: !!creds,
  });

  const rawFiltered: Category[] = useMemo(() => {
    const list = catalog.data?.categories || [];
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter((c) => !looksAdult({ category_name: c.category_name }));
  }, [catalog.data?.categories, hideAdult, parentalUnlocked]);

  const browsePrefsSlice = browseByAccount[accountKey];

  const { mode } = useMemo(
    () => getLiveCategorySortOptions(browsePrefsSlice),
    [browsePrefsSlice]
  );

  const manualDisplay = useMemo(
    () =>
      orderedLiveCategories(rawFiltered, {
        ...browsePrefsSlice,
        liveCategorySortMode: "manual",
      }),
    [rawFiltered, browsePrefsSlice]
  );

  const setMode = useCallback(
    (m: LiveCategorySortMode) => {
      if (!accountKey) return;
      if (m === "manual") {
        const cur = browseByAccount[accountKey];
        const hasOrder =
          Array.isArray(cur?.liveCategoryManualOrder) &&
          cur!.liveCategoryManualOrder!.length > 0;
        setBrowsePref(accountKey, {
          liveCategorySortMode: "manual",
          liveCategoryManualOrder: hasOrder
            ? cur!.liveCategoryManualOrder
            : defaultManualOrderFromCategories(rawFiltered),
        });
        return;
      }
      setBrowsePref(accountKey, {
        liveCategorySortMode: m,
        liveCategoryManualOrder: undefined,
      });
    },
    [accountKey, browseByAccount, rawFiltered, setBrowsePref]
  );

  const move = useCallback(
    (from: number, to: number) => {
      if (!accountKey || to < 0 || to >= manualDisplay.length) return;
      const ids = manualDisplay.map((c) => String(c.category_id));
      const arr = [...ids];
      const [it] = arr.splice(from, 1);
      if (!it) return;
      arr.splice(to, 0, it);
      setBrowsePref(accountKey, {
        liveCategorySortMode: "manual",
        liveCategoryManualOrder: arr,
      });
    },
    [accountKey, manualDisplay, setBrowsePref]
  );

  const resetManualToProvider = useCallback(() => {
    if (!accountKey) return;
    setBrowsePref(accountKey, {
      liveCategorySortMode: "manual",
      liveCategoryManualOrder:
        defaultManualOrderFromCategories(rawFiltered),
    });
  }, [accountKey, rawFiltered, setBrowsePref]);

  if (!creds || !accountKey) return null;

  return (
    <section className="card p-5">
      <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
        <ListOrdered className="size-4 text-(--brand-2)" />
        Live category order
      </h3>
      <p className="text-sm text-(--text-dim) mb-4">
        Chooses how groups appear in Live TV rails and the category browser for this Xtream login.
      </p>

      {catalog.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-(--text-muted)">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading categories…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            <SortModeButton
              active={mode === "provider"}
              onClick={() => setMode("provider")}
            >
              Provider default
            </SortModeButton>
            <SortModeButton
              active={mode === "az"}
              onClick={() => setMode("az")}
            >
              A–Z
            </SortModeButton>
            <SortModeButton
              active={mode === "manual"}
              onClick={() => setMode("manual")}
            >
              Custom order
            </SortModeButton>
          </div>

          {mode === "manual" && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={resetManualToProvider}
                  className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg border border-(--line) bg-(--bg-3) text-xs hover:border-(--brand)/35"
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Reset list to provider order
                </button>
              </div>

              <p className="text-[11px] text-(--text-muted) mb-2">
                New groups from your provider append at the bottom (sorted A–Z) until you reset or move them into your custom list.
              </p>

              <ul className="max-h-[min(50vh,360px)] overflow-y-auto rounded-xl border border-(--line) divide-y divide-(--line) bg-(--bg-3)/40">
                {manualDisplay.slice(0, 80).map((c, idx) => (
                  <li
                    key={String(c.category_id)}
                    className="flex items-center gap-2 px-2 py-2 min-h-[2.75rem]"
                  >
                    <span className="text-[11px] text-(--text-muted) tabular-nums w-7 shrink-0">
                      {idx + 1}
                    </span>
                    <span className="flex-1 min-w-0 text-sm truncate text-(--text)">
                      {c.category_name}
                    </span>
                    <div className="flex items-center shrink-0">
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-(--bg-2) disabled:opacity-35"
                        disabled={idx <= 0}
                        aria-label="Move category up"
                        onClick={() => move(idx, idx - 1)}
                      >
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-(--bg-2) disabled:opacity-35"
                        disabled={idx >= manualDisplay.length - 1}
                        aria-label="Move category down"
                        onClick={() => move(idx, idx + 1)}
                      >
                        <ArrowDown className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {manualDisplay.length > 80 && (
                <p className="text-[11px] text-(--text-muted) mt-2">
                  Showing first 80 of {manualDisplay.length}. Remaining categories follow at the bottom on Live TV.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
