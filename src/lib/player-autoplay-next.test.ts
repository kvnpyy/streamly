import { describe, expect, it } from "vitest";
import {
  AUTOPLAY_COUNTDOWN_SEC,
  autoplayDisplayCountdownSec,
  autoplayTriggerRemainingSec,
  episodeAutoplayKey,
  getSeriesNextEpisode,
  remainingPlaybackSec,
  shouldAutoplayOnEnded,
  shouldOfferAutoplayNext,
  tickAutoplayCountdown,
} from "./player-autoplay-next";
import type { PlayerPlaylist, PlayerSource } from "@/store/player";

const ep1: PlayerSource = {
  kind: "series",
  id: 10,
  streamId: 101,
  title: "Show",
  subtitle: "S1 · E1",
  url: "http://x/ep1",
};
const ep2: PlayerSource = {
  kind: "series",
  id: 10,
  streamId: 102,
  title: "Show",
  subtitle: "S1 · E2",
  url: "http://x/ep2",
};
const playlist: PlayerPlaylist = { kind: "series", items: [ep1, ep2] };

describe("getSeriesNextEpisode", () => {
  it("returns the next item in a series playlist", () => {
    expect(getSeriesNextEpisode(playlist, 0)).toEqual(ep2);
  });

  it("returns null on the last episode", () => {
    expect(getSeriesNextEpisode(playlist, 1)).toBeNull();
  });

  it("returns null for live playlists", () => {
    const live: PlayerPlaylist = {
      kind: "live",
      items: [{ kind: "live", id: 1, title: "News", url: "http://x/1" }],
    };
    expect(getSeriesNextEpisode(live, 0)).toBeNull();
  });
});

describe("shouldOfferAutoplayNext", () => {
  const base = {
    open: true,
    kind: "series" as const,
    playlist,
    index: 0,
    durationSec: 3600,
    currentTimeSec: 3588,
    dismissedForEpisode: false,
    watchCreditsForEpisode: false,
    hasNextEpisode: true,
  };

  it("offers autoplay inside the trigger window", () => {
    expect(shouldOfferAutoplayNext(base)).toBe(true);
  });

  it("does not offer autoplay too early", () => {
    expect(
      shouldOfferAutoplayNext({ ...base, currentTimeSec: 3500 })
    ).toBe(false);
  });

  it("does not offer autoplay when dismissed", () => {
    expect(
      shouldOfferAutoplayNext({ ...base, dismissedForEpisode: true })
    ).toBe(false);
  });

  it("does not offer autoplay when watching credits", () => {
    expect(
      shouldOfferAutoplayNext({ ...base, watchCreditsForEpisode: true })
    ).toBe(false);
  });

  it("does not offer autoplay on the final episode", () => {
    expect(
      shouldOfferAutoplayNext({
        ...base,
        index: 1,
        hasNextEpisode: false,
      })
    ).toBe(false);
  });

  it("does not offer autoplay for movies", () => {
    expect(
      shouldOfferAutoplayNext({
        ...base,
        kind: "movie",
        playlist: null,
        hasNextEpisode: false,
      })
    ).toBe(false);
  });
});

describe("shouldAutoplayOnEnded", () => {
  it("advances when series has a next episode and user did not cancel", () => {
    expect(
      shouldAutoplayOnEnded({
        kind: "series",
        playlist,
        index: 0,
        dismissedForEpisode: false,
        watchCreditsForEpisode: false,
        hasNextEpisode: true,
      })
    ).toBe(true);
  });

  it("does not advance when user dismissed", () => {
    expect(
      shouldAutoplayOnEnded({
        kind: "series",
        playlist,
        index: 0,
        dismissedForEpisode: true,
        watchCreditsForEpisode: false,
        hasNextEpisode: true,
      })
    ).toBe(false);
  });
});

describe("autoplayTriggerRemainingSec", () => {
  it("uses the standard window for normal-length episodes", () => {
    expect(autoplayTriggerRemainingSec(3600)).toBe(15);
  });

  it("returns 0 for very short clips", () => {
    expect(autoplayTriggerRemainingSec(20)).toBe(0);
  });
});

describe("episodeAutoplayKey", () => {
  it("keys by kind and playback url", () => {
    expect(episodeAutoplayKey(ep1)).toBe("series:http://x/ep1");
  });
});

describe("remainingPlaybackSec", () => {
  it("never returns negative values", () => {
    expect(remainingPlaybackSec(100, 150)).toBe(0);
    expect(remainingPlaybackSec(100, 85)).toBe(15);
  });
});

describe("AUTOPLAY_COUNTDOWN_SEC", () => {
  it("is a positive integer", () => {
    expect(AUTOPLAY_COUNTDOWN_SEC).toBeGreaterThan(0);
  });
});

describe("autoplayDisplayCountdownSec", () => {
  it("counts down from 5 inside the trigger window", () => {
    expect(
      autoplayDisplayCountdownSec({
        durationSec: 3600,
        currentTimeSec: 3585,
        shouldOffer: true,
      })
    ).toBe(5);
    expect(
      autoplayDisplayCountdownSec({
        durationSec: 3600,
        currentTimeSec: 3590,
        shouldOffer: true,
      })
    ).toBe(0);
  });

  it("returns null when the overlay should not show", () => {
    expect(
      autoplayDisplayCountdownSec({
        durationSec: 3600,
        currentTimeSec: 3500,
        shouldOffer: false,
      })
    ).toBeNull();
  });
});

describe("tickAutoplayCountdown", () => {
  it("counts down until advance", () => {
    expect(tickAutoplayCountdown(5)).toEqual({
      next: 4,
      shouldAdvance: false,
    });
    expect(tickAutoplayCountdown(1)).toEqual({
      next: null,
      shouldAdvance: true,
    });
    expect(tickAutoplayCountdown(null)).toEqual({
      next: null,
      shouldAdvance: false,
    });
  });
});
