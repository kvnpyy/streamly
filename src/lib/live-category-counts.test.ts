import { describe, expect, it } from "vitest";
import {
  buildLiveCategoryCounts,
  buildLiveCategoryCountsFromIndex,
  pickCountByIdForVisibleCategories,
} from "./live-category-counts";
import type { LiveStream } from "./xtream-types";

describe("buildLiveCategoryCounts", () => {
  it("counts streams per category", () => {
    const streams = [
      { stream_id: 1, category_id: "10", name: "A" },
      { stream_id: 2, category_id: "10", name: "B" },
      { stream_id: 3, category_id: "20", name: "C" },
    ] as LiveStream[];
    const counts = buildLiveCategoryCounts(streams, {
      hideAdult: false,
      parentalUnlocked: true,
      allowedCatIds: new Set(["10", "20"]),
    });
    expect(counts["10"]).toBe(2);
    expect(counts["20"]).toBe(1);
  });

  it("counts from stream index without walking streams", () => {
    const counts = buildLiveCategoryCountsFromIndex(
      { "10": [1, 2, 3], "20": [4] },
      new Set(["10", "20"])
    );
    expect(counts["10"]).toBe(3);
    expect(counts["20"]).toBe(1);
  });

  it("picks server counts for visible categories only", () => {
    const picked = pickCountByIdForVisibleCategories(
      { "10": 100, "20": 5, "99": 999 },
      ["10", "20"]
    );
    expect(picked).toEqual({ "10": 100, "20": 5 });
  });
});
