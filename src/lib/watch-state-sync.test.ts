import { describe, expect, it } from "vitest";
import {
  mergeRecents,
  mergeVodResumeSec,
  sanitizeRecents,
} from "./watch-state-sync";

describe("watch-state-sync", () => {
  it("mergeRecents keeps newer lastAt", () => {
    const local = [
      {
        kind: "movie" as const,
        id: 1,
        name: "A",
        addedAt: 100,
        lastAt: 500,
      },
    ];
    const remote = [
      {
        kind: "movie" as const,
        id: 1,
        name: "A old",
        addedAt: 200,
        lastAt: 200,
      },
      {
        kind: "live" as const,
        id: 2,
        name: "News",
        addedAt: 300,
        lastAt: 300,
      },
    ];
    const merged = mergeRecents(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.id === 1)?.lastAt).toBe(500);
  });

  it("mergeVodResumeSec keeps max seconds per key", () => {
    expect(
      mergeVodResumeSec(
        { "x|movie|1": 120 },
        { "x|movie|1": 90, "x|movie|2": 40 }
      )
    ).toEqual({
      "x|movie|1": 120,
      "x|movie|2": 40,
    });
  });

  it("sanitizeRecents rejects invalid rows", () => {
    expect(
      sanitizeRecents([{ kind: "movie", id: 0, name: "x", lastAt: 1 }])
    ).toHaveLength(0);
  });

  it("sanitizeRecents coerces string id and numeric name", () => {
    const out = sanitizeRecents([
      { kind: "movie", id: "42", name: 12345, lastAt: 100, addedAt: 50 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe(42);
    expect(out[0]?.name).toBe("12345");
  });
});
