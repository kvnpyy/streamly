import type { Category } from "@/lib/xtream-types";
import type { BrowsePrefs } from "@/store/preferences";

export type LiveCategorySortMode = "provider" | "az" | "manual";

const DEFAULT_MODE: LiveCategorySortMode = "provider";

/** Resolve sort mode + manual order slice from persisted browse prefs */
export function getLiveCategorySortOptions(
  prefs: BrowsePrefs | undefined
): {
  mode: LiveCategorySortMode;
  manualOrder: string[];
} {
  const rawMode = prefs?.liveCategorySortMode;
  const mode =
    rawMode === "az" || rawMode === "manual" || rawMode === "provider"
      ? rawMode
      : DEFAULT_MODE;
  const manualOrder =
    prefs?.liveCategoryManualOrder?.filter((x) => typeof x === "string") ?? [];
  return { mode, manualOrder };
}

/**
 * Reorder playlist categories for UI rails/pickers (`filteredCats`).
 * Unknown IDs (new from provider) are appended: after manual/remnants sorted A–Z.
 */
export function orderedLiveCategories(
  categories: Category[],
  prefs: BrowsePrefs | undefined
): Category[] {
  const { mode, manualOrder } = getLiveCategorySortOptions(prefs);
  if (!categories.length) return categories;

  if (mode === "provider") {
    return [...categories];
  }

  const byId = new Map<string, Category>();
  for (const c of categories) {
    byId.set(String(c.category_id), c);
  }

  if (mode === "az") {
    return [...categories].sort((a, b) =>
      safeLowerSort(a.category_name, b.category_name)
    );
  }

  /** manual — order by manualOrder, then leftovers A-Z */
  const used = new Set<string>();
  const out: Category[] = [];
  for (const id of manualOrder) {
    const row = byId.get(String(id));
    if (!row || used.has(String(row.category_id))) continue;
    used.add(String(row.category_id));
    out.push(row);
  }
  const rest: Category[] = [];
  for (const c of categories) {
    const id = String(c.category_id);
    if (!used.has(id)) rest.push(c);
  }
  rest.sort((a, b) => safeLowerSort(a.category_name, b.category_name));
  out.push(...rest);
  return out;
}

function safeLowerSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/** Initialize `liveCategoryManualOrder` from provider order once (custom mode). */
export function defaultManualOrderFromCategories(categories: Category[]): string[] {
  return categories.map((c) => String(c.category_id));
}
