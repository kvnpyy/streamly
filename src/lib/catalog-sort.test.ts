import { describe, expect, it } from "vitest";
import { catalogSortLabel } from "@/components/CatalogSortToggle";
import { shouldUseInstantCatalogGrid } from "@/lib/catalog-sort";

describe("shouldUseInstantCatalogGrid", () => {
  it("defers only on default browse with no search", () => {
    expect(shouldUseInstantCatalogGrid("added", "")).toBe(false);
    expect(shouldUseInstantCatalogGrid("added", "  ")).toBe(false);
    expect(shouldUseInstantCatalogGrid("rating", "")).toBe(true);
    expect(shouldUseInstantCatalogGrid("name", "")).toBe(true);
    expect(shouldUseInstantCatalogGrid("added", "batman")).toBe(true);
  });
});

describe("catalogSortLabel", () => {
  it("labels non-default sorts", () => {
    expect(catalogSortLabel("added")).toBeNull();
    expect(catalogSortLabel("rating")).toBe("Highest rated");
    expect(catalogSortLabel("name")).toBe("A–Z");
  });
});
