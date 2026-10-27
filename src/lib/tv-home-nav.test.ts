import { describe, expect, it } from "vitest";
import { MY_LIST_LABEL } from "@/lib/my-list";
import { TV_HOME_QUICK_NAV } from "@/lib/tv-home-nav";

describe("TV_HOME_QUICK_NAV", () => {
  it("includes My List with the other living-room destinations", () => {
    expect(TV_HOME_QUICK_NAV.map((item) => item.label)).toEqual([
      "Live TV",
      "Movies",
      "Series",
      MY_LIST_LABEL,
    ]);
    expect(TV_HOME_QUICK_NAV.find((item) => item.label === MY_LIST_LABEL)?.href).toBe(
      "/app/favorites"
    );
  });
});
