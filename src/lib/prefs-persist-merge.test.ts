import { describe, expect, it } from "vitest";
import { mergePersistedPrefs } from "./prefs-persist-merge";
import type { PrefsState } from "@/store/preferences";

function basePrefs(overrides: Partial<PrefsState> = {}): PrefsState {
  return {
    favorites: [],
    recents: [],
    browseByAccount: {},
    setBrowsePref: () => {},
    activeSavedProviderAccountId: null,
    setActiveSavedProviderAccountId: () => {},
    sidebarCollapsed: false,
    setSidebarCollapsed: () => {},
    comfortTvBrowsing: false,
    setComfortTvBrowsing: () => {},
    hideAdult: true,
    parentalPin: null,
    parentalUnlocked: false,
    setHideAdult: () => {},
    setParentalPin: () => {},
    unlockParental: () => false,
    lockParental: () => {},
    toggleFavorite: () => {},
    isFavorite: () => false,
    setFavorites: () => {},
    setRecents: () => {},
    setVodResumeSec: () => {},
    addRecent: () => {},
    clearRecents: () => {},
    removeRecent: () => {},
    resetAllPrefs: () => {},
    vodResumeSec: {},
    saveVodResume: () => {},
    getVodResume: () => undefined,
    clearVodResume: () => {},
    tvRegionFilter: null,
    setTvRegionFilter: () => {},
    ...overrides,
  };
}

describe("mergePersistedPrefs", () => {
  it("unions in-memory My List toggles with disk favorites", () => {
    const current = basePrefs({
      favorites: [
        { kind: "movie", id: 9, name: "New Like", addedAt: 500 },
      ],
    });
    const merged = mergePersistedPrefs(
      {
        favorites: [{ kind: "movie", id: 1, name: "Saved", addedAt: 100 }],
      },
      current
    );
    expect(merged.favorites).toHaveLength(2);
    expect(merged.favorites.some((f) => f.id === 9)).toBe(true);
    expect(merged.favorites.some((f) => f.id === 1)).toBe(true);
  });

  it("keeps session-only parentalUnlocked from current state", () => {
    const current = basePrefs({ parentalUnlocked: true });
    const merged = mergePersistedPrefs({}, current);
    expect(merged.parentalUnlocked).toBe(true);
  });
});
