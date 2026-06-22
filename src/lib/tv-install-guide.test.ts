import { describe, expect, it } from "vitest";
import {
  TV_PLATFORM_GUIDES,
  tvInstallUrl,
  tvLoginUrl,
} from "@/lib/tv-install-guide";

describe("tv-install-guide", () => {
  it("lists four TV platforms", () => {
    expect(TV_PLATFORM_GUIDES).toHaveLength(4);
    expect(TV_PLATFORM_GUIDES.map((g) => g.id)).toEqual([
      "samsung",
      "lg",
      "firetv",
      "androidtv",
    ]);
  });

  it("builds login and install URLs from origin", () => {
    expect(tvLoginUrl("https://example.com")).toBe("https://example.com/login");
    expect(tvInstallUrl("https://example.com/")).toBe("https://example.com/tv");
  });
});
