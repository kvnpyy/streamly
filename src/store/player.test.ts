import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayer, type PlayerSource } from "./player";

const s1: PlayerSource = {
  kind: "live",
  id: 1,
  title: "One",
  url: "http://x/1",
};
const s2: PlayerSource = {
  kind: "live",
  id: 2,
  title: "Two",
  url: "http://x/2",
};
const s3: PlayerSource = {
  kind: "live",
  id: 3,
  title: "Three",
  url: "http://x/3",
};

describe("usePlayer flip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePlayer.setState({
      current: null,
      open: false,
      playlist: null,
      index: -1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    usePlayer.getState().close();
  });

  it("immediate flip switches channel without waiting for debounce", () => {
    usePlayer
      .getState()
      .play(s1, { playlist: { kind: "live", items: [s1, s2, s3] } });
    usePlayer.getState().flip(1, { immediate: true });
    expect(usePlayer.getState().current?.id).toBe(2);
  });

  it("debounced live flip applies after the TV debounce window", () => {
    usePlayer
      .getState()
      .play(s1, { playlist: { kind: "live", items: [s1, s2, s3] } });
    usePlayer.getState().flip(1);
    expect(usePlayer.getState().current?.id).toBe(1);
    vi.advanceTimersByTime(600);
    expect(usePlayer.getState().current?.id).toBe(2);
  });

  it("resolves playlist index from current when index was stale", () => {
    usePlayer.setState({
      current: s2,
      open: true,
      playlist: { kind: "live", items: [s1, s2, s3] },
      index: -1,
    });
    usePlayer.getState().flip(1, { immediate: true });
    expect(usePlayer.getState().current?.id).toBe(3);
    expect(usePlayer.getState().index).toBe(2);
  });

  it("immediate flip advances series episodes by playback url", () => {
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
    usePlayer
      .getState()
      .play(ep1, { playlist: { kind: "series", items: [ep1, ep2] } });
    usePlayer.getState().flip(1, { immediate: true });
    expect(usePlayer.getState().current?.streamId).toBe(102);
    expect(usePlayer.getState().index).toBe(1);
  });
});
