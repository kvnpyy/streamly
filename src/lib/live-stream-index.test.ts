import { describe, expect, it } from "vitest";
import { lookupStreamIdsForCategory } from "./live-stream-index";

describe("lookupStreamIdsForCategory", () => {
  const index = {
    "10": [1, 2],
    "42": [9],
  };

  it("finds by exact string key", () => {
    expect(lookupStreamIdsForCategory(index, "10")).toEqual([1, 2]);
  });

  it("finds by numeric category id", () => {
    expect(lookupStreamIdsForCategory(index, "42")).toEqual([9]);
  });
});
