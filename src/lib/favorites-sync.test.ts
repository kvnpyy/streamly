import { describe, expect, it } from "vitest";
import {
  mergeFavorites,
  sanitizeFavorites,
  isValidProviderAccountKey,
} from "./favorites-sync";
import type { Favorite } from "@/store/preferences";

describe("mergeFavorites", () => {
  it("unions by kind+id and keeps newer addedAt", () => {
    const local: Favorite[] = [
      { kind: "live", id: 1, name: "Local A", addedAt: 100 },
      { kind: "movie", id: 2, name: "Movie", addedAt: 200 },
    ];
    const remote: Favorite[] = [
      { kind: "live", id: 1, name: "Remote A", addedAt: 300 },
      { kind: "series", id: 3, name: "Series", addedAt: 150 },
    ];
    const merged = mergeFavorites(local, remote);
    expect(merged).toHaveLength(3);
    expect(merged.find((f) => f.kind === "live" && f.id === 1)?.name).toBe(
      "Remote A"
    );
  });

  it("caps at 500 items", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({
      kind: "live" as const,
      id: i + 1,
      name: `Ch ${i}`,
      addedAt: i,
    }));
    expect(mergeFavorites(many, []).length).toBe(500);
  });
});

describe("sanitizeFavorites", () => {
  it("drops invalid rows", () => {
    expect(
      sanitizeFavorites([
        { kind: "live", id: 1, name: "OK", addedAt: 1 },
        { kind: "bad", id: 2, name: "Nope", addedAt: 1 },
        null,
      ])
    ).toEqual([{ kind: "live", id: 1, name: "OK", addedAt: 1 }]);
  });
});

describe("isValidProviderAccountKey", () => {
  it("requires pipe-separated server|username", () => {
    expect(isValidProviderAccountKey("http://x.com|user")).toBe(true);
    expect(isValidProviderAccountKey("nope")).toBe(false);
    expect(isValidProviderAccountKey("")).toBe(false);
  });
});
