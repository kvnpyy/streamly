"use client";

import { dispatchMyListToggle } from "@/lib/my-list";
import { sanitizeRecents } from "@/lib/watch-state-sync";
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
  | "activeSavedProviderAccountId"
  | "tvRegionFilter"
>;

type PrefsState = {
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
  /** Replace recently watched (used by cloud sync). */
  setRecents: (recents: RecentItem[]) => void;
  /** Replace VOD resume map (used by cloud sync). */
  setVodResumeSec: (vodResumeSec: Record<string, number>) => void;
  addRecent: (f: Omit<Favorite, "addedAt">) => void;
  clearRecents: () => void;
  removeRecent: (kind: FavoriteKind, id: number) => void;
  /** Reset persisted prefs (favorites, recents, browse memory, parental PIN). */
  resetAllPrefs: () => void;
  /** VOD resume positions (seconds). Key: `${accountKey}|movie|${streamId}` or `|series|…`. */
  vodResumeSec: Record<string, number>;
  saveVodResume: (storageKey: string, seconds: number) => void;
  getVodResume: (storageKey: string) => number | undefined;
  clearVodResume: (storageKey: string) => void;
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
        set({
          browseByAccount: {
            ...get().browseByAccount,
            [accountKey]: {
              ...get().browseByAccount[accountKey],
              ...patch,
            },
          },
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
      setRecents: (recents) => set({ recents: sanitizeRecents(recents) }),
      setVodResumeSec: (vodResumeSec) => set({ vodResumeSec }),
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
      clearRecents: () => set({ recents: [] }),
      removeRecent: (kind, id) =>
        set({
          recents: get().recents.filter(
            (x) => !(x.kind === kind && x.id === id)
          ),
        }),
      vodResumeSec: {},
      saveVodResume: (storageKey, seconds) => {
        if (!storageKey || !Number.isFinite(seconds) || seconds < 12) return;
        set((state) => {
          const next = { ...state.vodResumeSec, [storageKey]: seconds };
          const keys = Object.keys(next);
          if (keys.length <= 220) return { vodResumeSec: next };
          const drop = keys.length - 200;
          for (let i = 0; i < drop; i++) delete next[keys[i]!];
          return { vodResumeSec: next };
        });
      },
      getVodResume: (storageKey) =>
        storageKey ? get().vodResumeSec[storageKey] : undefined,
      clearVodResume: (storageKey) => {
        if (!storageKey) return;
        set((state) => {
          const rest = { ...state.vodResumeSec };
          delete rest[storageKey];
          return { vodResumeSec: rest };
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
      partialize: (s) => ({
        favorites: s.favorites,
        recents: s.recents,
        browseByAccount: s.browseByAccount,
        hideAdult: s.hideAdult,
        parentalPin: s.parentalPin,
        sidebarCollapsed: s.sidebarCollapsed,
        comfortTvBrowsing: s.comfortTvBrowsing,
        vodResumeSec: s.vodResumeSec,
        activeSavedProviderAccountId: s.activeSavedProviderAccountId,
        tvRegionFilter: s.tvRegionFilter,
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
          activeSavedProviderAccountId:
            typeof p.activeSavedProviderAccountId === "string"
              ? p.activeSavedProviderAccountId
              : null,
          // null = auto-detect on first TV browse visit
          tvRegionFilter: null,
        };
      },
    }
  )
);
