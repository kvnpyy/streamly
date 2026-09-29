import { describe, expect, it } from "vitest";
import {
  applyRecentDismissals,
  mergeRecentDismissals,
  mergeRecents,
  mergeVodResumeSec,
  mergeVodResumeSnapshots,
  parseStoredRecentDismissals,
  sanitizeRecents,
  sanitizeVodResumeSec,
  VOD_RESUME_KEYS_MAX,
  VOD_RESUME_WATCHED_SENTINEL,
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

  it("applyRecentDismissals hides a title removed after it was watched", () => {
    const recents = [
      {
        kind: "movie" as const,
        id: 1,
        name: "A",
        addedAt: 100,
        lastAt: 200,
      },
      {
        kind: "series" as const,
        id: 2,
        name: "B",
        addedAt: 100,
        lastAt: 900,
      },
    ];
    const hidden = applyRecentDismissals(recents, { "movie:1": 500 });
    expect(hidden.map((r) => r.id)).toEqual([2]);
  });

  it("applyRecentDismissals keeps a title watched again after removal", () => {
    const kept = applyRecentDismissals(
      [
        {
          kind: "movie" as const,
          id: 1,
          name: "A",
          addedAt: 100,
          lastAt: 800,
        },
      ],
      { "movie:1": 500 }
    );
    expect(kept).toHaveLength(1);
  });

  it("mergeRecentDismissals keeps the newer removal", () => {
    expect(
      mergeRecentDismissals({ "movie:1": 100 }, { "movie:1": 400, "live:2": 50 })
    ).toEqual({ "movie:1": 400, "live:2": 50 });
  });

  it("parseStoredRecentDismissals reads the resume blob", () => {
    expect(
      parseStoredRecentDismissals({ sec: {}, at: {}, dismissed: { "series:9": 12 } })
    ).toEqual({ "series:9": 12 });
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

  it("sanitizeVodResumeSec keeps the mark-watched sentinel", () => {
    expect(
      sanitizeVodResumeSec({ "acct|series|9": VOD_RESUME_WATCHED_SENTINEL })
    ).toEqual({ "acct|series|9": VOD_RESUME_WATCHED_SENTINEL });
  });

  it("mergeVodResumeSnapshots lets a newer unwatch clear a saved position", () => {
    const merged = mergeVodResumeSnapshots(
      { sec: {}, writeAt: { "acct|series|9": 500 } },
      { sec: { "acct|series|9": 3312 }, writeAt: { "acct|series|9": 100 } }
    );
    expect(merged.sec["acct|series|9"]).toBeUndefined();
    expect(merged.writeAt["acct|series|9"]).toBe(500);
  });

  it("mergeVodResumeSnapshots keeps a newer watch over an older unwatch", () => {
    const merged = mergeVodResumeSnapshots(
      {
        sec: { "acct|series|9": VOD_RESUME_WATCHED_SENTINEL },
        writeAt: { "acct|series|9": 800 },
      },
      { sec: {}, writeAt: { "acct|series|9": 200 } }
    );
    expect(merged.sec["acct|series|9"]).toBe(VOD_RESUME_WATCHED_SENTINEL);
  });

  it("merge keeps the furthest position when neither side recorded a time", () => {
    expect(
      mergeVodResumeSec({ "acct|series|9": 3312 }, { "acct|series|9": 90 })
    ).toEqual({ "acct|series|9": 3312 });
  });

  it("trim keeps a newly watched episode when the map is over the cap", () => {
    const sec: Record<string, number> = {};
    const writeAt: Record<string, number> = {};
    for (let i = 0; i < VOD_RESUME_KEYS_MAX; i++) {
      sec[`old|movie|${i}`] = 100;
      writeAt[`old|movie|${i}`] = i + 1;
    }
    const merged = mergeVodResumeSnapshots(
      {
        sec: { "new|series|1": VOD_RESUME_WATCHED_SENTINEL },
        writeAt: { "new|series|1": VOD_RESUME_KEYS_MAX + 10 },
      },
      { sec, writeAt }
    );
    expect(merged.sec["new|series|1"]).toBe(VOD_RESUME_WATCHED_SENTINEL);
    expect(Object.keys(merged.sec)).toHaveLength(VOD_RESUME_KEYS_MAX);
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
