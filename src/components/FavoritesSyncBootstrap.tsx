"use client";

import { mergeFavorites } from "@/lib/favorites-sync";
import {
  onPrefsFinishHydration,
  prefsHasHydrated,
} from "@/lib/prefs-persist-api";
import {
  applyRecentDismissals,
  mergeRecentDismissals,
  mergeRecents,
  mergeVodResumeForAccount,
  recentDismissalsEqual,
  sanitizeRecents,
  vodResumeSnapshotForAccount,
  vodResumeSnapshotsEqual,
  type VodResumeSnapshot,
} from "@/lib/watch-state-sync";
import { useAuth } from "@/store/auth";
import {
  browseAccountKey,
  usePrefs,
  type Favorite,
  type RecentItem,
} from "@/store/preferences";
import { useSession } from "next-auth/react";
import { isLibraryHomePath } from "@/lib/home-route";
import { isMobileShellWidth } from "@/lib/shell-layout";
import { isTvClassUserAgent } from "@/lib/tv-user-agent";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const PUSH_DEBOUNCE_MS = 1200;

function subscribePrefsHydrated(onStoreChange: () => void): () => void {
  if (prefsHasHydrated()) {
    return () => {};
  }
  return onPrefsFinishHydration(onStoreChange);
}

function getPrefsHydratedSnapshot(): boolean {
  return prefsHasHydrated();
}

async function fetchRemoteFavorites(
  accountKey: string
): Promise<Favorite[] | null> {
  try {
    const url = new URL(`${window.location.origin}/api/favorites`);
    url.searchParams.set("accountKey", accountKey);
    const res = await fetch(url.toString(), {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      favorites?: Favorite[];
    };
    return Array.isArray(data.favorites) ? data.favorites : [];
  } catch {
    /* offline, VPN flip, ERR_NETWORK_CHANGED, etc. */
    return null;
  }
}

async function pushFavorites(
  accountKey: string,
  favorites: Favorite[],
  opts?: { onStaleSession?: () => void }
): Promise<boolean> {
  try {
    const res = await fetch(`${window.location.origin}/api/favorites`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountKey, favorites }),
    });
    if (res.status === 409) {
      opts?.onStaleSession?.();
      return false;
    }
    return res.ok;
  } catch {
    return false;
  }
}

type RemoteWatchState = {
  recents: RecentItem[];
  resume: VodResumeSnapshot;
  dismissed: Record<string, number>;
};

async function fetchRemoteWatchState(
  accountKey: string
): Promise<RemoteWatchState | null> {
  try {
    const url = new URL(`${window.location.origin}/api/watch-state`);
    url.searchParams.set("accountKey", accountKey);
    const res = await fetch(url.toString(), {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      recents?: RecentItem[];
      vodResumeSec?: Record<string, number>;
      vodResumeWriteAt?: Record<string, number>;
      recentDismissedAt?: Record<string, number>;
    };
    return {
      recents: Array.isArray(data.recents) ? data.recents : [],
      resume: {
        sec:
          data.vodResumeSec && typeof data.vodResumeSec === "object"
            ? data.vodResumeSec
            : {},
        writeAt:
          data.vodResumeWriteAt && typeof data.vodResumeWriteAt === "object"
            ? data.vodResumeWriteAt
            : {},
      },
      dismissed:
        data.recentDismissedAt && typeof data.recentDismissedAt === "object"
          ? data.recentDismissedAt
          : {},
    };
  } catch {
    return null;
  }
}

function isTitleDetailPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/app\/(?:series|movies)\/[^/]+/.test(pathname);
}

async function pushWatchState(
  accountKey: string,
  recents: RecentItem[],
  resume: VodResumeSnapshot,
  dismissed: Record<string, number>,
  opts?: { onStaleSession?: () => void; keepalive?: boolean }
): Promise<boolean> {
  try {
    const res = await fetch(`${window.location.origin}/api/watch-state`, {
      method: "PUT",
      credentials: "include",
      keepalive: opts?.keepalive === true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountKey,
        recents,
        vodResumeSec: resume.sec,
        vodResumeWriteAt: resume.writeAt,
        recentDismissedAt: dismissed,
      }),
    });
    if (res.status === 409) {
      opts?.onStaleSession?.();
      return false;
    }
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * When signed into a Stream account, merge local favorites + recently watched
 * with the server copy for the active Xtream login and keep them in sync across devices.
 */
export function FavoritesSyncBootstrap({ children }: { children: ReactNode }) {
  const creds = useAuth((s) => s.creds);
  const { status } = useSession();
  const streamSignedIn = status === "authenticated";
  const accountKey = creds ? browseAccountKey(creds) : null;
  const pathname = usePathname();
  const onLibraryHome = isLibraryHomePath(pathname);
  const onTitlePage = isTitleDetailPath(pathname);

  const prefsHydrated = useSyncExternalStore(
    subscribePrefsHydrated,
    getPrefsHydratedSnapshot,
    () => false
  );
  const accountKeyRef = useRef(accountKey);
  const activeLibraryKeyRef = useRef<string | null>(null);
  const activePullKeyRef = useRef<string | null>(null);
  const favPushTimerRef = useRef<number | null>(null);
  const watchPushTimerRef = useRef<number | null>(null);
  const favPushingRef = useRef(false);
  const watchPushingRef = useRef(false);
  const watchPushAgainRef = useRef(false);
  const skipNextFavPushRef = useRef(false);
  const skipNextWatchPushRef = useRef(false);
  const cloudSyncBlockedRef = useRef(false);
  const lastWatchPullAtRef = useRef(0);
  const watchPullingRef = useRef(false);
  const pullCloudRef = useRef<() => Promise<void>>(async () => {});
  const pushWatchNowRef = useRef<(keepalive?: boolean) => void>(() => {});

  const onStaleCloudSession = useCallback(() => {
    cloudSyncBlockedRef.current = true;
  }, []);

  useEffect(() => {
    accountKeyRef.current = accountKey;
  }, [accountKey]);

  useEffect(() => {
    if (!accountKey || !prefsHydrated) return;
    const previous = activeLibraryKeyRef.current;
    if (previous === accountKey) return;
    skipNextFavPushRef.current = true;
    skipNextWatchPushRef.current = true;
    if (favPushTimerRef.current !== null) {
      window.clearTimeout(favPushTimerRef.current);
      favPushTimerRef.current = null;
    }
    if (watchPushTimerRef.current !== null) {
      window.clearTimeout(watchPushTimerRef.current);
      watchPushTimerRef.current = null;
      if (previous) {
        const { recents, vodResumeSec, vodResumeWriteAt, recentDismissedAt } =
          usePrefs.getState();
        void pushWatchState(
          previous,
          recents,
          vodResumeSnapshotForAccount(
            { sec: vodResumeSec, writeAt: vodResumeWriteAt },
            previous
          ),
          recentDismissedAt,
          { onStaleSession: onStaleCloudSession, keepalive: true }
        );
      }
    }
    lastWatchPullAtRef.current = 0;
    usePrefs.getState().swapActiveLibrary(previous, accountKey);
    activeLibraryKeyRef.current = accountKey;
  }, [accountKey, prefsHydrated, onStaleCloudSession]);

  const pullCloud = useCallback(async () => {
    const key = accountKeyRef.current;
    if (!key || !streamSignedIn || !prefsHydrated) return;
    if (cloudSyncBlockedRef.current || watchPullingRef.current) return;
    if (Date.now() - lastWatchPullAtRef.current < 1_500) return;

    watchPullingRef.current = true;
    activePullKeyRef.current = key;
    lastWatchPullAtRef.current = Date.now();
    try {
      let remoteFavorites: Favorite[] | null = null;
      let remoteWatch: RemoteWatchState | null = null;
      try {
        [remoteFavorites, remoteWatch] = await Promise.all([
          fetchRemoteFavorites(key),
          fetchRemoteWatchState(key),
        ]);
      } catch {
        lastWatchPullAtRef.current = 0;
        return;
      }
      if (accountKeyRef.current !== key) return;

      if (remoteFavorites !== null) {
        const local = usePrefs.getState().favorites;
        const merged = mergeFavorites(local, remoteFavorites);
        if (accountKeyRef.current !== key) return;
        skipNextFavPushRef.current = true;
        usePrefs.getState().setFavorites(merged);

        if (merged.length !== remoteFavorites.length) {
          await pushFavorites(key, merged, {
            onStaleSession: onStaleCloudSession,
          });
        }
      }

      if (remoteWatch !== null && accountKeyRef.current === key) {
        const localRecents = usePrefs.getState().recents;
        const localResume: VodResumeSnapshot = {
          sec: usePrefs.getState().vodResumeSec,
          writeAt: usePrefs.getState().vodResumeWriteAt,
        };
        const dismissed = mergeRecentDismissals(
          usePrefs.getState().recentDismissedAt,
          remoteWatch.dismissed
        );
        const mergedRecents = sanitizeRecents(
          applyRecentDismissals(
            mergeRecents(localRecents, remoteWatch.recents),
            dismissed
          )
        );
        const mergedResume = mergeVodResumeForAccount(
          localResume,
          remoteWatch.resume,
          key
        );
        const accountResume = vodResumeSnapshotForAccount(mergedResume, key);
        if (accountKeyRef.current !== key) return;
        skipNextWatchPushRef.current = true;
        usePrefs.getState().setSyncedWatch(
          mergedRecents,
          mergedResume.sec,
          mergedResume.writeAt,
          dismissed
        );

        const remoteAccount = vodResumeSnapshotForAccount(
          remoteWatch.resume,
          key
        );
        if (
          mergedRecents.length !== remoteWatch.recents.length ||
          !vodResumeSnapshotsEqual(accountResume, remoteAccount) ||
          !recentDismissalsEqual(dismissed, remoteWatch.dismissed)
        ) {
          await pushWatchState(key, mergedRecents, accountResume, dismissed, {
            onStaleSession: onStaleCloudSession,
          });
        }
      }

      if (remoteFavorites === null && remoteWatch === null) {
        lastWatchPullAtRef.current = 0;
      }
    } finally {
      watchPullingRef.current = false;
      if (activePullKeyRef.current === key) activePullKeyRef.current = null;
    }
  }, [onStaleCloudSession, prefsHydrated, streamSignedIn]);

  useEffect(() => {
    pullCloudRef.current = pullCloud;
  }, [pullCloud]);

  useEffect(() => {
    if (!streamSignedIn || !accountKey || !prefsHydrated) return;
    let cancelled = false;
    const tvShell =
      typeof navigator !== "undefined" &&
      isTvClassUserAgent(navigator.userAgent || "");
    /** Title pages and TV pull quickly so a refresh shows the other device's progress. */
    const delayMs =
      tvShell || onTitlePage
        ? 250
        : onLibraryHome
          ? isMobileShellWidth()
            ? 2_500
            : 1_000
          : isMobileShellWidth()
            ? 1_200
            : 400;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (onTitlePage) lastWatchPullAtRef.current = 0;
      void pullCloudRef.current();
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [streamSignedIn, accountKey, prefsHydrated, onLibraryHome, onTitlePage]);

  useEffect(() => {
    if (!streamSignedIn || !accountKey || !prefsHydrated) return;
    const key = accountKey;

    const pushLatest = (keepalive: boolean) => {
      if (cloudSyncBlockedRef.current) return;
      if (watchPushingRef.current) {
        watchPushAgainRef.current = true;
        return;
      }
      watchPushingRef.current = true;
      const { recents, vodResumeSec, vodResumeWriteAt, recentDismissedAt } =
        usePrefs.getState();
      void pushWatchState(
        key,
        recents,
        vodResumeSnapshotForAccount(
          { sec: vodResumeSec, writeAt: vodResumeWriteAt },
          key
        ),
        recentDismissedAt,
        { onStaleSession: onStaleCloudSession, keepalive }
      ).finally(() => {
        watchPushingRef.current = false;
        if (watchPushAgainRef.current && !cloudSyncBlockedRef.current) {
          watchPushAgainRef.current = false;
          pushLatest(false);
        }
      });
    };

    const scheduleWatchPush = () => {
      if (watchPushTimerRef.current !== null) {
        window.clearTimeout(watchPushTimerRef.current);
      }
      watchPushTimerRef.current = window.setTimeout(() => {
        watchPushTimerRef.current = null;
        pushLatest(false);
      }, PUSH_DEBOUNCE_MS);
    };

    pushWatchNowRef.current = (keepalive?: boolean) => {
      if (watchPushTimerRef.current !== null) {
        window.clearTimeout(watchPushTimerRef.current);
        watchPushTimerRef.current = null;
      }
      pushLatest(keepalive === true);
    };

    const unsub = usePrefs.subscribe((state, prev) => {
      if (cloudSyncBlockedRef.current) return;

      if (state.favorites !== prev.favorites) {
        if (skipNextFavPushRef.current) {
          skipNextFavPushRef.current = false;
        } else {
          if (favPushTimerRef.current !== null) {
            window.clearTimeout(favPushTimerRef.current);
          }
          favPushTimerRef.current = window.setTimeout(() => {
            favPushTimerRef.current = null;
            if (favPushingRef.current || cloudSyncBlockedRef.current) return;
            favPushingRef.current = true;
            const favorites = usePrefs.getState().favorites;
            void pushFavorites(key, favorites, {
              onStaleSession: onStaleCloudSession,
            }).finally(() => {
              favPushingRef.current = false;
            });
          }, PUSH_DEBOUNCE_MS);
        }
      }

      const watchChanged =
        state.recents !== prev.recents ||
        state.vodResumeSec !== prev.vodResumeSec ||
        state.vodResumeWriteAt !== prev.vodResumeWriteAt ||
        state.recentDismissedAt !== prev.recentDismissedAt;
      if (watchChanged) {
        if (skipNextWatchPushRef.current) {
          skipNextWatchPushRef.current = false;
        } else {
          scheduleWatchPush();
        }
      }
    });

    const pullIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      lastWatchPullAtRef.current = 0;
      void pullCloudRef.current();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        pushWatchNowRef.current(true);
        return;
      }
      pullIfVisible();
    };

    const onPageHide = () => {
      pushWatchNowRef.current(true);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", pullIfVisible);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", pullIfVisible);
      window.removeEventListener("pagehide", onPageHide);
      pushWatchNowRef.current = () => {};
      if (favPushTimerRef.current !== null) {
        window.clearTimeout(favPushTimerRef.current);
        favPushTimerRef.current = null;
      }
      const watchPending = watchPushTimerRef.current !== null;
      if (watchPushTimerRef.current !== null) {
        window.clearTimeout(watchPushTimerRef.current);
        watchPushTimerRef.current = null;
      }
      if (watchPending) pushLatest(true);
    };
  }, [streamSignedIn, accountKey, prefsHydrated, onStaleCloudSession]);

  useEffect(() => {
    if (!streamSignedIn) {
      cloudSyncBlockedRef.current = false;
    }
  }, [streamSignedIn]);

  return children;
}
