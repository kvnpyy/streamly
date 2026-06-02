import { describe, expect, it } from "vitest";
import { isLibraryHomePath } from "./home-route";

describe("isLibraryHomePath", () => {
  it("matches library landing", () => {
    expect(isLibraryHomePath("/app")).toBe(true);
    expect(isLibraryHomePath("/app/")).toBe(true);
  });

  it("does not match other app routes", () => {
    expect(isLibraryHomePath("/app/live")).toBe(false);
    expect(isLibraryHomePath("/app/movies")).toBe(false);
  });
});
