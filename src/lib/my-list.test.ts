import { describe, expect, it } from "vitest";
import { MY_LIST_LABEL, myListToggleMessage } from "./my-list";

describe("my-list", () => {
  it("myListToggleMessage uses My List label", () => {
    expect(myListToggleMessage(true)).toBe(`Added to ${MY_LIST_LABEL}`);
    expect(myListToggleMessage(false)).toBe(`Removed from ${MY_LIST_LABEL}`);
  });
});
