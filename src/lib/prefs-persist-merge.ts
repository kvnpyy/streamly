import { mergeFavorites } from "@/lib/favorites-sync";
import {
  applyRecentDismissals,
  mergeRecentDismissals,
  mergeRecents,
  mergeVodResumeSnapshots,
  sanitizeRecents,
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
  | "vodResumeWriteAt"
  | "recentDismissedAt"
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

  const recentDismissedAt = mergeRecentDismissals(
    currentState.recentDismissedAt ?? {},
    p.recentDismissedAt && typeof p.recentDismissedAt === "object"
      ? p.recentDismissedAt
      : {}
  );

  const resume = mergeVodResumeSnapshots(
    {
      sec: currentState.vodResumeSec,
      writeAt: currentState.vodResumeWriteAt ?? {},
    },
    {
      sec:
        p.vodResumeSec && typeof p.vodResumeSec === "object"
          ? p.vodResumeSec
          : {},
      writeAt:
        p.vodResumeWriteAt && typeof p.vodResumeWriteAt === "object"
          ? p.vodResumeWriteAt
          : {},
    }
  );

  return {
    ...currentState,
    favorites: mergeFavorites(
      currentState.favorites,
      Array.isArray(p.favorites) ? p.favorites : []
    ),
    recents: sanitizeRecents(
      applyRecentDismissals(
        mergeRecents(
          currentState.recents,
          Array.isArray(p.recents) ? p.recents : []
        ),
        recentDismissedAt
      )
    ),
    vodResumeSec: resume.sec,
    vodResumeWriteAt: resume.writeAt,
    recentDismissedAt,
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
