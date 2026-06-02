import { describe, expect, it } from "vitest";
import {
  CATEGORIES_PER_BUILD_SLICE,
  SHELF_PREFETCH_AHEAD,
} from "@/hooks/use-live-category-shelves";

describe("live-shelf-pagination", () => {
  it("uses small bounded slices so a single click cannot scan the whole catalog", () => {
    expect(CATEGORIES_PER_BUILD_SLICE).toBeLessThanOrEqual(8);
    expect(SHELF_PREFETCH_AHEAD).toBeLessThanOrEqual(12);
  });
});
