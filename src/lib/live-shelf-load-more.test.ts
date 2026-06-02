import { describe, expect, it } from "vitest";
import {
  resolveVisibleAfterBuild,
  shouldChainBootstrapBuild,
  shouldChainClickBuild,
  shouldPrefetchShelves,
} from "./live-shelf-load-more";

describe("shouldPrefetchShelves", () => {
  it("does not prefetch when visible is ahead of built (avoids build storm)", () => {
    expect(
      shouldPrefetchShelves({
        builtCount: 6,
        visibleCount: 10,
        prefetchAhead: 6,
        moreCategoriesPending: true,
        shelvesBuilding: false,
        userLoadInProgress: false,
      })
    ).toBe(false);
  });

  it("prefetches when built buffer is below target ahead of visible", () => {
    expect(
      shouldPrefetchShelves({
        builtCount: 8,
        visibleCount: 6,
        prefetchAhead: 4,
        moreCategoriesPending: true,
        shelvesBuilding: false,
        userLoadInProgress: false,
      })
    ).toBe(true);
  });

  it("does not prefetch when prefetch ahead is zero", () => {
    expect(
      shouldPrefetchShelves({
        builtCount: 6,
        visibleCount: 6,
        prefetchAhead: 0,
        moreCategoriesPending: true,
        shelvesBuilding: false,
        userLoadInProgress: false,
      })
    ).toBe(false);
  });
});

describe("shouldChainClickBuild", () => {
  it("chains while built count is below the click reveal target", () => {
    expect(
      shouldChainClickBuild({
        clickActive: true,
        builtCount: 6,
        targetVisible: 8,
        hasMoreCategories: true,
        slicesDone: 0,
        maxSlices: 4,
      })
    ).toBe(true);
  });

  it("stops when the reveal target is already buildable", () => {
    expect(
      shouldChainClickBuild({
        clickActive: true,
        builtCount: 10,
        targetVisible: 8,
        hasMoreCategories: true,
        slicesDone: 0,
        maxSlices: 4,
      })
    ).toBe(false);
  });
});

describe("shouldChainBootstrapBuild", () => {
  it("does not bootstrap while a user click build is active", () => {
    expect(
      shouldChainBootstrapBuild({
        bootstrapping: true,
        builtCount: 2,
        initialVisible: 6,
        bufferAhead: 4,
        categoriesScanned: 4,
        maxCategoryScan: 20,
        hasMoreCategories: true,
        userClickInProgress: true,
      })
    ).toBe(false);
  });
});

describe("resolveVisibleAfterBuild", () => {
  it("clamps to built count when catalog is exhausted", () => {
    expect(
      resolveVisibleAfterBuild({
        targetVisible: 12,
        builtCount: 6,
      })
    ).toBe(6);
  });
});
