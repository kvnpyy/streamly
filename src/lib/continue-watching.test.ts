import { describe, expect, it } from "vitest";
import {
  buildMoviePlayerSourceFromRecent,
  buildPlayerSourceFromRecent,
  buildSeriesPlayerSourceFromRecent,
  computeContinueProgressPct,
  CONTINUE_PROGRESS_MIN_SEC,
  findSeriesResumeTarget,
  parseRecentEpisodeMeta,
  recentResumeStorageKey,
  seriesEpisodeRecentMeta,
} from "./continue-watching";

describe("continue-watching", () => {
  const creds = {
    server: "http://panel.example",
    username: "user",
    password: "pass",
  };
  const accountKey = "http://panel.example|user";

  it("parseRecentEpisodeMeta reads episode fields", () => {
    expect(
      parseRecentEpisodeMeta({
        episodeStreamId: 99,
        season: "2",
        episodeNum: 5,
        containerExt: "mkv",
        durationSec: 3600,
      })
    ).toEqual({
      episodeStreamId: 99,
      season: "2",
      episodeNum: 5,
      containerExt: "mkv",
      durationSec: 3600,
    });
  });

  it("recentResumeStorageKey for movie uses stream id", () => {
    expect(
      recentResumeStorageKey(accountKey, {
        kind: "movie",
        id: 42,
        name: "Film",
        addedAt: 1,
        lastAt: 1,
      })
    ).toBe(`${accountKey}|movie|42`);
  });

  it("recentResumeStorageKey for series needs episode meta", () => {
    expect(
      recentResumeStorageKey(accountKey, {
        kind: "series",
        id: 7,
        name: "Show",
        addedAt: 1,
        lastAt: 1,
      })
    ).toBeNull();
    expect(
      recentResumeStorageKey(accountKey, {
        kind: "series",
        id: 7,
        name: "Show",
        addedAt: 1,
        lastAt: 1,
        meta: { episodeStreamId: 501, season: "1", episodeNum: 3 },
      })
    ).toBe(`${accountKey}|series|501`);
  });

  it("computeContinueProgressPct respects duration", () => {
    expect(computeContinueProgressPct(CONTINUE_PROGRESS_MIN_SEC - 1)).toBeNull();
    expect(computeContinueProgressPct(600, 3600)).toBe(17);
    expect(computeContinueProgressPct(3000, 3600)).toBe(83);
    expect(computeContinueProgressPct(600)).toBe(40);
  });

  it("buildMoviePlayerSourceFromRecent produces playable source", () => {
    const src = buildMoviePlayerSourceFromRecent(creds, {
      kind: "movie",
      id: 10,
      name: "Alpha",
      addedAt: 1,
      lastAt: 1,
    });
    expect(src.kind).toBe("movie");
    expect(src.url).toContain("/api/stream");
    expect(src.id).toBe(10);
  });

  it("buildSeriesPlayerSourceFromRecent requires episode meta", () => {
    expect(
      buildSeriesPlayerSourceFromRecent(creds, {
        kind: "series",
        id: 3,
        name: "Drama",
        addedAt: 1,
        lastAt: 1,
      })
    ).toBeNull();
    const src = buildSeriesPlayerSourceFromRecent(creds, {
      kind: "series",
      id: 3,
      name: "Drama",
      addedAt: 1,
      lastAt: 1,
      meta: { episodeStreamId: 88, season: "1", episodeNum: 2 },
    });
    expect(src?.streamId).toBe(88);
    expect(src?.subtitle).toBe("S1 · E2");
  });

  it("buildPlayerSourceFromRecent routes by kind", () => {
    expect(
      buildPlayerSourceFromRecent(creds, {
        kind: "live",
        id: 1,
        name: "News",
        addedAt: 1,
        lastAt: 1,
      })
    ).toBeNull();
  });

  it("findSeriesResumeTarget picks furthest resume", () => {
    const ordered = [
      {
        season: "1",
        ep: {
          id: "10",
          episode_num: "1",
          title: "Pilot",
          container_extension: "mp4",
        },
      },
      {
        season: "1",
        ep: {
          id: "11",
          episode_num: "2",
          title: "Two",
          container_extension: "mp4",
        },
      },
    ];
    const vodResumeSec = {
      [`${accountKey}|series|10`]: 100,
      [`${accountKey}|series|11`]: 900,
    };
    const hit = findSeriesResumeTarget(accountKey, 5, ordered, vodResumeSec);
    expect(hit?.episode.id).toBe("11");
    expect(hit?.resumeSec).toBe(900);
  });

  it("seriesEpisodeRecentMeta includes duration when present", () => {
    const meta = seriesEpisodeRecentMeta("2", {
      id: "55",
      episode_num: "4",
      title: "Mid",
      container_extension: "mkv",
      info: { duration_secs: 2700 },
    });
    expect(meta.episodeStreamId).toBe(55);
    expect(meta.durationSec).toBe(2700);
  });
});
