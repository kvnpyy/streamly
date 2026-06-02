/** Max category slices to run after one "Show more" click before giving up. */
export const MAX_SLICES_PER_LOAD_REQUEST = 4;

/** Keep chaining idle/bootstrap builds until this many shelves exist (or scan cap). */
export function shouldChainBootstrapBuild({
  bootstrapping,
  builtCount,
  initialVisible,
  bufferAhead,
  categoriesScanned,
  maxCategoryScan,
  hasMoreCategories,
  userClickInProgress,
}: {
  bootstrapping: boolean;
  builtCount: number;
  initialVisible: number;
  bufferAhead: number;
  categoriesScanned: number;
  maxCategoryScan: number;
  hasMoreCategories: boolean;
  userClickInProgress: boolean;
}): boolean {
  if (userClickInProgress || !bootstrapping || !hasMoreCategories) return false;
  if (categoriesScanned >= maxCategoryScan) return false;
  return builtCount < initialVisible + bufferAhead;
}

/** Chain another slice during a user "Show more" click until the reveal target is buildable. */
export function shouldChainClickBuild({
  clickActive,
  builtCount,
  targetVisible,
  hasMoreCategories,
  slicesDone,
  maxSlices,
}: {
  clickActive: boolean;
  builtCount: number;
  targetVisible: number;
  hasMoreCategories: boolean;
  slicesDone: number;
  maxSlices: number;
}): boolean {
  if (!clickActive || targetVisible <= 0) return false;
  if (slicesDone >= maxSlices) return false;
  if (!hasMoreCategories) return false;
  return builtCount < targetVisible;
}

/** True when idle prefetch should queue another build slice. */
export function shouldPrefetchShelves({
  builtCount,
  visibleCount,
  prefetchAhead,
  moreCategoriesPending,
  shelvesBuilding,
  userLoadInProgress,
}: {
  builtCount: number;
  visibleCount: number;
  prefetchAhead: number;
  moreCategoriesPending: boolean;
  shelvesBuilding: boolean;
  userLoadInProgress: boolean;
}): boolean {
  if (userLoadInProgress || shelvesBuilding || !moreCategoriesPending) return false;
  if (visibleCount > builtCount) return false;
  return builtCount < visibleCount + prefetchAhead;
}

/** Visible count after a user click finishes (built shelves or catalog exhausted). */
export function resolveVisibleAfterBuild({
  targetVisible,
  builtCount,
}: {
  targetVisible: number;
  builtCount: number;
}): number {
  if (targetVisible <= 0) return builtCount;
  return Math.min(targetVisible, builtCount);
}
