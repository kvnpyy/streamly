import type { Category } from "@/lib/xtream-types";
import type { BrowsePrefs } from "@/store/preferences";

export type CategoryVisibilityKind = "live" | "movies" | "series";

const PREF_KEY: Record<
  CategoryVisibilityKind,
  keyof Pick<
    BrowsePrefs,
    | "liveVisibleCategoryIds"
    | "moviesVisibleCategoryIds"
    | "seriesVisibleCategoryIds"
  >
> = {
  live: "liveVisibleCategoryIds",
  movies: "moviesVisibleCategoryIds",
  series: "seriesVisibleCategoryIds",
};

/** Empty / missing → show every category (no filter). */
export function normalizeVisibleCategoryIds(
  ids: unknown
): string[] | undefined {
  if (!Array.isArray(ids) || ids.length === 0) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const id = String(raw).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length > 0 ? out : undefined;
}

export function getVisibleCategoryIds(
  prefs: BrowsePrefs | undefined,
  kind: CategoryVisibilityKind
): string[] | undefined {
  return normalizeVisibleCategoryIds(prefs?.[PREF_KEY[kind]]);
}

/**
 * When `visibleIds` is set, keep only those category_ids (provider order preserved).
 * Missing IDs are ignored; empty/undefined means show all.
 */
export function filterCategoriesByVisibility(
  categories: Category[],
  visibleIds: string[] | undefined
): Category[] {
  const allow = normalizeVisibleCategoryIds(visibleIds);
  if (!allow) return categories;
  const set = new Set(allow);
  return categories.filter((c) => set.has(String(c.category_id)));
}

export function categoryVisibilityPrefKey(
  kind: CategoryVisibilityKind
): keyof BrowsePrefs {
  return PREF_KEY[kind];
}
