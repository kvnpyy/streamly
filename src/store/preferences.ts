"use client";

import { browsePrefPatchIsNoop } from "@/lib/browse-pref-patch";
import { favoriteKey } from "@/lib/favorites-sync";
import { dispatchMyListToggle } from "@/lib/my-list";
import { mergePersistedPrefs } from "@/lib/prefs-persist-merge";
import { swapAccountLibrary } from "@/lib/library-by-account";
import {
  applyRecentDismissals,
  sanitizeRecents,
  trimRecentDismissals,
  trimVodResumeSnapshot,
} from "@/lib/watch-state-sync";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TvRegion } from "@/lib/geo-continent";

/** Same rules as `normalizeServer` in `@/lib/utils` — inlined here so this
 *  store never imports `clsx` / `tailwind-merge` (avoids heavy deps + odd
 *  chunk interactions with some browser extensions). */
function normalizeServerUrl(url: string): string {
  let u = url.trim();
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = "http://" + u;
  return u.replace(/\/+$/, "");
}

export type FavoriteKind = "live" | "movie" | "series";

export type Favorite = {
  kind: FavoriteKind;
  id: number;
  name: string;
  icon?: string;
  meta?: Record<string, string | number | undefined>;
  addedAt: number;
};

export type RecentItem = Favorite & { lastAt: number };

/** Last-used category / view per Xtream account (`server|username`). */
export type BrowsePrefs = {
  liveCategory?: string | "all";
  liveView?: "list" | "guide";
  moviesCategory?: string | "all";
  seriesCategory?: string | "all";
  moviesLanguage?: string | "all";
  seriesLanguage?: string | "all";
  /** How live category rails / pickers sort groups for this Xtream login. */
  liveCategorySortMode?: "provider" | "az" | "manual";
  /** Ordered `category_id` strings when `liveCategorySortMode === "manual"`. */
  liveCategoryManualOrder?: string[];
  /**
   * When non-empty, Live pickers/rails only list these `category_id`s.
   * Empty / omitted → show all (still subject to adult / region filters).
   */
  liveVisibleCategoryIds?: string[];
  /** Same as `liveVisibleCategoryIds` for Movies genres. */
  moviesVisibleCategoryIds?: string[];
  /** Same as `liveVisibleCategoryIds` for Series genres. */
  seriesVisibleCategoryIds?: string[];
};

/** Last season/episode opened for a series. Key: `${accountKey}|series|${seriesId}`. */
export type SeriesBrowseFocus = {
  season: string;
  episodeId: string;
  at: number;
};

/** Stable per-account key; must match whatever login stores on `creds`. */
export function browseAccountKey(creds: {
  server: string;
  username: string;
}): string {
  const server = normalizeServerUrl(creds.server).toLowerCase();
  return `${server}|${creds.username.trim()}`;
}

/** Shape written to localStorage (see `partialize`). */
type PersistedPrefsV8 = Pick<
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
  | "libraryByAccount"
  | "activeSavedProviderAccountId"
  | "tvRegionFilter"
  | "seriesBrowseFocus"
>;

export type PrefsState = {
  favorites: Favorite[];
  recents: RecentItem[];
  browseByAccount: Record<string, BrowsePrefs>;
  setBrowsePref: (accountKey: string, patch: Partial<BrowsePrefs>) => void;
  /**
   * Last `/api/provider-accounts` row the user activated (highlights playlist switcher).
   * Null when switching only via Xtream login / session without a saved row.
   */
  activeSavedProviderAccountId: string | null;
  setActiveSavedProviderAccountId: (id: string | null) => void;
  /** Desktop sidebar rail (md+) — icon-only when true */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  /** Larger type & targets for projector / couch use; Smart TV browsers turn this on automatically. */
  comfortTvBrowsing: boolean;
  setComfortTvBrowsing: (v: boolean) => void;
  // Parental controls
  hideAdult: boolean;
  parentalPin: string | null;
  parentalUnlocked: boolean; // session-only unlock flag
  setHideAdult: (v: boolean) => void;
  setParentalPin: (pin: string | null) => void;
  unlockParental: (pin: string) => boolean;
  lockParental: () => void;
  toggleFavorite: (f: Omit<Favorite, "addedAt">) => void;
  isFavorite: (kind: FavoriteKind, id: number) => boolean;
  /** Replace favorites list (used by cloud sync). */
  setFavorites: (favorites: Favorite[]) => void;
  /** Replace recently watched (used by cloud sync). Honors removal stamps. */
  setRecents: (recents: RecentItem[]) => void;
  /**
   * One cloud-sync write for continue watching, resume, and removals.
   * A single update so the sync listener does not push a half-applied pull.
   */
  setSyncedWatch: (
    recents: RecentItem[],
    vodResumeSec: Record<string, number>,
    vodResumeWriteAt: Record<string, number>,
    recentDismissedAt: Record<string, number>
  ) => void;
  /** Replace VOD resume map (used by cloud sync). */
  setVodResumeSec: (
    vodResumeSec: Record<string, number>,
    vodResumeWriteAt?: Record<string, number>
  ) => void;
  addRecent: (f: Omit<Favorite, "addedAt">) => void;
  clearRecents: () => void;
  removeRecent: (kind: FavoriteKind, id: number) => void;
  /** Reset persisted prefs (favorites, recents, browse memory, parental PIN). */
  resetAllPrefs: () => void;
  /** VOD resume positions (seconds). Key: `${accountKey}|movie|${streamId}` or `|series|…`. */
  vodResumeSec: Record<string, number>;
  /** Epoch ms of the last resume write or explicit clear, keyed like `vodResumeSec`. */
  vodResumeWriteAt: Record<string, number>;
  /** Epoch ms a Continue Watching title was removed, keyed `kind:id`. */
  recentDismissedAt: Record<string, number>;
  /**
   * Continue Watching and My List saved per provider login, so switching
   * playlists does not show the previous provider's titles.
   */
  libraryByAccount: Record<
    string,
    {
      favorites: Favorite[];
      recents: RecentItem[];
      recentDismissedAt: Record<string, number>;
    }
  >;
  swapActiveLibrary: (fromKey: string | null, toKey: string) => void;
  saveVodResume: (storageKey: string, seconds: number) => void;
  getVodResume: (storageKey: string) => number | undefined;
  clearVodResume: (storageKey: string) => void;
  saveVodResumeMany: (
    entries: { storageKey: string; seconds: number }[]
  ) => void;
  clearVodResumeMany: (storageKeys: string[]) => void;
  /** Last season tab opened per series, so the list does not reset to season 1. */
  seriesBrowseFocus: Record<string, SeriesBrowseFocus>;
  rememberSeriesFocus: (storageKey: string, focus: SeriesBrowseFocus) => void;
  /**
   * TV region filter for the live browse layout.
   * null  → auto-detect from timezone on first visit
   * "All" → no filter (show all categories)
   * other → show only categories matching this region + generic categories
   */
  tvRegionFilter: TvRegion | null;
  setTvRegionFilter: (r: TvRegion | null) => void;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recents: [],
      browseByAccount: {},
      setBrowsePref: (accountKey, patch) =>
        set((state) => {
          const prev = state.browseByAccount[accountKey];
          if (browsePrefPatchIsNoop(prev, patch)) return state;
          return {
            browseByAccount: {
              ...state.browseByAccount,
              [accountKey]: {
                ...prev,
                ...patch,
              },
            },
          };
        }),
      activeSavedProviderAccountId: null,
      setActiveSavedProviderAccountId: (id) =>
        set({ activeSavedProviderAccountId: id }),
      hideAdult: true,
      parentalPin: null,
      parentalUnlocked: false,
      setHideAdult: (v) => set({ hideAdult: v }),
      setParentalPin: (pin) => set({ parentalPin: pin }),
      unlockParental: (pin) => {
        const stored = get().parentalPin;
        if (!stored || stored === pin) {
          set({ parentalUnlocked: true });
          return true;
        }
        return false;
      },
      lockParental: () => set({ parentalUnlocked: false }),
      toggleFavorite: (f) => {
        const exists = get().favorites.find(
          (x) => x.kind === f.kind && x.id === f.id
        );
        if (exists) {
          set({
            favorites: get().favorites.filter(
              (x) => !(x.kind === f.kind && x.id === f.id)
            ),
          });
          dispatchMyListToggle(false);
        } else {
          set({
            favorites: [{ ...f, addedAt: Date.now() }, ...get().favorites].slice(
              0,
              500
            ),
          });
          dispatchMyListToggle(true);
        }
      },
      isFavorite: (kind, id) =>
        !!get().favorites.find((x) => x.kind === kind && x.id === id),
      setFavorites: (favorites) => set({ favorites }),
      setRecents: (recents) =>
        set((state) => ({
          recents: sanitizeRecents(
            applyRecentDismissals(recents, state.recentDismissedAt)
          ),
        })),
      setSyncedWatch: (recents, vodResumeSec, vodResumeWriteAt, recentDismissedAt) =>
        set({
          recents: sanitizeRecents(
            applyRecentDismissals(recents, recentDismissedAt)
          ),
          vodResumeSec,
          vodResumeWriteAt,
          recentDismissedAt,
        }),
      setVodResumeSec: (vodResumeSec, vodResumeWriteAt) =>
        set((state) => ({
          vodResumeSec,
          vodResumeWriteAt: vodResumeWriteAt ?? state.vodResumeWriteAt,
        })),
      addRecent: (f) => {
        const filtered = get().recents.filter(
          (x) => !(x.kind === f.kind && x.id === f.id)
        );
        set({
          recents: [
            { ...f, addedAt: Date.now(), lastAt: Date.now() },
            ...filtered,
          ].slice(0, 50),
        });
      },
      clearRecents: () =>
        set((state) => {
          const now = Date.now();
          const recentDismissedAt = { ...state.recentDismissedAt };
          for (const recent of state.recents) {
            recentDismissedAt[favoriteKey(recent)] = now;
          }
          const writeAt = { ...state.vodResumeWriteAt };
          for (const key of Object.keys(state.vodResumeSec)) {
            writeAt[key] = now;
          }
          const trimmed = trimVodResumeSnapshot({ sec: {}, writeAt });
          return {
            recents: [],
            vodResumeSec: trimmed.sec,
            vodResumeWriteAt: trimmed.writeAt,
            recentDismissedAt: trimRecentDismissals(recentDismissedAt),
          };
        }),
      removeRecent: (kind, id) =>
        set((state) => ({
          recents: state.recents.filter(
            (x) => !(x.kind === kind && x.id === id)
          ),
          recentDismissedAt: trimRecentDismissals({
            ...state.recentDismissedAt,
            [`${kind}:${id}`]: Date.now(),
          }),
        })),
      vodResumeSec: {},
      vodResumeWriteAt: {},
      recentDismissedAt: {},
      libraryByAccount: {},
      swapActiveLibrary: (fromKey, toKey) =>
        set((state) => swapAccountLibrary(state, fromKey, toKey)),
      saveVodResume: (storageKey, seconds) => {
        if (!storageKey || !Number.isFinite(seconds) || seconds < 12) return;
        const now = Date.now();
        set((state) => {
          const trimmed = trimVodResumeSnapshot({
            sec: { ...state.vodResumeSec, [storageKey]: seconds },
            writeAt: { ...state.vodResumeWriteAt, [storageKey]: now },
          });
          return {
            vodResumeSec: trimmed.sec,
            vodResumeWriteAt: trimmed.writeAt,
          };
        });
      },
      getVodResume: (storageKey) =>
        storageKey ? get().vodResumeSec[storageKey] : undefined,
      clearVodResume: (storageKey) => {
        if (!storageKey) return;
        const now = Date.now();
        set((state) => {
          const sec = { ...state.vodResumeSec };
          delete sec[storageKey];
          const trimmed = trimVodResumeSnapshot({
            sec,
            writeAt: { ...state.vodResumeWriteAt, [storageKey]: now },
          });
          return {
            vodResumeSec: trimmed.sec,
            vodResumeWriteAt: trimmed.writeAt,
          };
        });
      },
      saveVodResumeMany: (entries) => {
        if (!entries.length) return;
        const now = Date.now();
        set((state) => {
          const sec = { ...state.vodResumeSec };
          const writeAt = { ...state.vodResumeWriteAt };
          for (const entry of entries) {
            if (
              !entry.storageKey ||
              !Number.isFinite(entry.seconds) ||
              entry.seconds < 12
            ) {
              continue;
            }
            sec[entry.storageKey] = entry.seconds;
            writeAt[entry.storageKey] = now;
          }
          const trimmed = trimVodResumeSnapshot({ sec, writeAt });
          return {
            vodResumeSec: trimmed.sec,
            vodResumeWriteAt: trimmed.writeAt,
          };
        });
      },
      clearVodResumeMany: (storageKeys) => {
        if (!storageKeys.length) return;
        const now = Date.now();
        set((state) => {
          const sec = { ...state.vodResumeSec };
          const writeAt = { ...state.vodResumeWriteAt };
          for (const key of storageKeys) {
            if (!key) continue;
            delete sec[key];
            writeAt[key] = now;
          }
          const trimmed = trimVodResumeSnapshot({ sec, writeAt });
          return {
            vodResumeSec: trimmed.sec,
            vodResumeWriteAt: trimmed.writeAt,
          };
        });
      },
      seriesBrowseFocus: {},
      rememberSeriesFocus: (storageKey, focus) => {
        if (!storageKey || !focus.season) return;
        set((state) => {
          const next = {
            ...state.seriesBrowseFocus,
            [storageKey]: focus,
          };
          const keys = Object.keys(next);
          if (keys.length > 200) {
            keys
              .sort((a, b) => (next[a]?.at ?? 0) - (next[b]?.at ?? 0))
              .slice(0, keys.length - 200)
              .forEach((key) => {
                delete next[key];
              });
          }
          return { seriesBrowseFocus: next };
        });
      },
      resetAllPrefs: () =>
        set({
          favorites: [],
          recents: [],
          browseByAccount: {},
          hideAdult: true,
          parentalPin: null,
          parentalUnlocked: false,
          sidebarCollapsed: false,
          comfortTvBrowsing: false,
          vodResumeSec: {},
          vodResumeWriteAt: {},
          recentDismissedAt: {},
          libraryByAccount: {},
          activeSavedProviderAccountId: null,
        }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      comfortTvBrowsing: false,
      setComfortTvBrowsing: (v) => set({ comfortTvBrowsing: v }),
      tvRegionFilter: null,
      setTvRegionFilter: (r) => set({ tvRegionFilter: r }),
    }),
    {
      name: "iptv-prefs",
      version: 8,
      /** Defer localStorage parse — `PrefsRehydrateBootstrap` rehydrates on idle. */
      skipHydration: true,
      merge: mergePersistedPrefs,
      partialize: (s) => ({
        favorites: s.favorites,
        recents: s.recents,
        browseByAccount: s.browseByAccount,
        hideAdult: s.hideAdult,
        parentalPin: s.parentalPin,
        sidebarCollapsed: s.sidebarCollapsed,
        comfortTvBrowsing: s.comfortTvBrowsing,
        vodResumeSec: s.vodResumeSec,
        vodResumeWriteAt: s.vodResumeWriteAt,
        recentDismissedAt: s.recentDismissedAt,
        libraryByAccount: s.libraryByAccount,
        activeSavedProviderAccountId: s.activeSavedProviderAccountId,
        tvRegionFilter: s.tvRegionFilter,
        seriesBrowseFocus: s.seriesBrowseFocus,
      }),
      migrate: (persisted): PersistedPrefsV8 => {
        const p = persisted as Partial<PersistedPrefsV8>;
        const baseBrowse =
          p.browseByAccount && typeof p.browseByAccount === "object"
            ? p.browseByAccount
            : {};
        return {
          favorites: Array.isArray(p.favorites) ? p.favorites : [],
          recents: sanitizeRecents(
            Array.isArray(p.recents) ? p.recents : []
          ),
          browseByAccount: baseBrowse,
          hideAdult: typeof p.hideAdult === "boolean" ? p.hideAdult : true,
          parentalPin:
            p.parentalPin === undefined || p.parentalPin === null
              ? null
              : String(p.parentalPin),
          sidebarCollapsed:
            typeof p.sidebarCollapsed === "boolean"
              ? p.sidebarCollapsed
              : false,
          comfortTvBrowsing:
            typeof p.comfortTvBrowsing === "boolean"
              ? p.comfortTvBrowsing
              : false,
          vodResumeSec:
            p.vodResumeSec && typeof p.vodResumeSec === "object"
              ? p.vodResumeSec
              : {},
          vodResumeWriteAt:
            p.vodResumeWriteAt && typeof p.vodResumeWriteAt === "object"
              ? p.vodResumeWriteAt
              : {},
          recentDismissedAt:
            p.recentDismissedAt && typeof p.recentDismissedAt === "object"
              ? p.recentDismissedAt
              : {},
          libraryByAccount:
            p.libraryByAccount && typeof p.libraryByAccount === "object"
              ? p.libraryByAccount
              : {},
          activeSavedProviderAccountId:
            typeof p.activeSavedProviderAccountId === "string"
              ? p.activeSavedProviderAccountId
              : null,
          seriesBrowseFocus:
            p.seriesBrowseFocus && typeof p.seriesBrowseFocus === "object"
              ? p.seriesBrowseFocus
              : {},
          // null = auto-detect on first TV browse visit
          tvRegionFilter: null,
        };
      },
    }
  )
);
