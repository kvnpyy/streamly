import { mergeFavorites } from "@/lib/favorites-sync";
import {
  mergeRecents,
  mergeVodResumeSec,
  sanitizeRecents,
  sanitizeVodResumeSec,
} from "@/lib/watch-state-sync";
import type { BrowsePrefs, PrefsState } from "@/store/preferences";

type PersistedPrefsSlice = Pick<
  PrefsState,
  | "favorites"
  | "recents"
  | "browseByAccount"
  | "hideAdult"
  | "parentalPin"
  | "sidebarCollapsed"
  | "comfortTvBrowsing"
  | "vodResumeSec"
  | "activeSavedProviderAccountId"
  | "tvRegionFilter"
>;

/**
 * Merge disk prefs into in-memory state without clobbering changes made before
 * deferred rehydration (e.g. My List toggles while Library home still defers
 * localStorage reads).
 */
export function mergePersistedPrefs(
  persistedState: unknown,
  currentState: PrefsState
): PrefsState {
  const p = (persistedState ?? {}) as Partial<PersistedPrefsSlice>;
  const persistedBrowse =
    p.browseByAccount && typeof p.browseByAccount === "object"
      ? p.browseByAccount
      : {};
  const currentBrowse =
    currentState.browseByAccount && typeof currentState.browseByAccount === "object"
      ? currentState.browseByAccount
      : {};

  const mergedBrowse: Record<string, BrowsePrefs> = { ...persistedBrowse };
  for (const [key, value] of Object.entries(currentBrowse)) {
    mergedBrowse[key] = { ...mergedBrowse[key], ...value };
  }

  return {
    ...currentState,
    favorites: mergeFavorites(
      currentState.favorites,
      Array.isArray(p.favorites) ? p.favorites : []
    ),
    recents: sanitizeRecents(
      mergeRecents(
        currentState.recents,
        Array.isArray(p.recents) ? p.recents : []
      )
    ),
    vodResumeSec: sanitizeVodResumeSec(
      mergeVodResumeSec(
        currentState.vodResumeSec,
        p.vodResumeSec && typeof p.vodResumeSec === "object"
          ? p.vodResumeSec
          : {}
      )
    ),
    browseByAccount: mergedBrowse,
    hideAdult:
      typeof p.hideAdult === "boolean" ? p.hideAdult : currentState.hideAdult,
    parentalPin:
      p.parentalPin === undefined || p.parentalPin === null
        ? currentState.parentalPin
        : String(p.parentalPin),
    sidebarCollapsed:
      typeof p.sidebarCollapsed === "boolean"
        ? p.sidebarCollapsed
        : currentState.sidebarCollapsed,
    comfortTvBrowsing:
      typeof p.comfortTvBrowsing === "boolean"
        ? p.comfortTvBrowsing
        : currentState.comfortTvBrowsing,
    activeSavedProviderAccountId:
      typeof p.activeSavedProviderAccountId === "string"
        ? p.activeSavedProviderAccountId
        : currentState.activeSavedProviderAccountId,
    tvRegionFilter:
      p.tvRegionFilter !== undefined ? p.tvRegionFilter : currentState.tvRegionFilter,
  };
}
