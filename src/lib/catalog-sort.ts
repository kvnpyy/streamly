import type { CatalogSort } from "@/components/CatalogSortToggle";

/** Skip `useDeferredValue` when the user expects an immediate visible reorder. */
export function shouldUseInstantCatalogGrid(
  sort: CatalogSort,
  qFilter: string
): boolean {
  return sort !== "added" || qFilter.trim().length > 0;
}
