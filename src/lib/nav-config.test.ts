import { describe, expect, it } from "vitest";
import {
  APP_NAV,
  MOBILE_NAV_MORE,
  MOBILE_NAV_PRIMARY,
} from "./nav-config";

describe("nav-config", () => {
  it("promotes Series on mobile primary; home via top bar logo", () => {
    const myList = APP_NAV.find((n) => n.href === "/app/favorites");
    expect(myList?.label).toBe("My List");

    expect(MOBILE_NAV_PRIMARY.map((n) => n.href)).toEqual([
      "/app/live",
      "/app/movies",
      "/app/series",
      "/app/search",
    ]);
    expect(MOBILE_NAV_MORE.map((n) => n.href)).toEqual([
      "/app/favorites",
      "/app/tv",
    ]);
  });
});
