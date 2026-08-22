import { describe, expect, it } from "vitest";
import { mapsShallowEqual } from "./maps-shallow-equal";

describe("mapsShallowEqual", () => {
  it("treats two empty maps as equal", () => {
    expect(mapsShallowEqual(new Map(), new Map())).toBe(true);
  });

  it("compares keys and values", () => {
    expect(mapsShallowEqual(new Map([[1, "a"]]), new Map([[1, "a"]]))).toBe(
      true
    );
    expect(mapsShallowEqual(new Map([[1, "a"]]), new Map([[1, "b"]]))).toBe(
      false
    );
    expect(mapsShallowEqual(new Map([[1, "a"]]), new Map([[2, "a"]]))).toBe(
      false
    );
  });
});
