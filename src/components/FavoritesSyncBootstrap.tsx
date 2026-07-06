"use client";

import { mergeFavorites } from "@/lib/favorites-sync";
import {
  mergeRecents,
  mergeVodResumeSec,
  sanitizeRecents,
  sanitizeVodResumeSec,
} from "@/lib/watch-state-sync";
import { useAuth } from "@/store/auth";
import {
  browseAccountKey,
  usePrefs,
  type Favorite,
  type RecentItem,
} from "@/store/preferences";
import { useSession } from "next-auth/react";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import { isLibraryHomePath } from "@/lib/home-route";
import { isMobileShellWidth } from "@/lib/shell-layout";
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
  if (usePrefs.persist.hasHydrated()) {
    return () => {};
  }
  return usePrefs.persist.onFinishHydration(onStoreChange);
}

function getPrefsHydratedSnapshot(): boolean {
  return usePrefs.persist.hasHydrated();
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
  vodResumeSec: Record<string, number>;
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
    };
    return {
      recents: Array.isArray(data.recents) ? data.recents : [],
      vodResumeSec:
        data.vodResumeSec && typeof data.vodResumeSec === "object"
          ? data.vodResumeSec
          : {},
    };
  } catch {
    return null;
  }
}

async function pushWatchState(
  accountKey: string,
  recents: RecentItem[],
  vodResumeSec: Record<string, number>,
  opts?: { onStaleSession?: () => void }
): Promise<boolean> {
  try {
    const res = await fetch(`${window.location.origin}/api/watch-state`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountKey, recents, vodResumeSec }),
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

  const prefsHydrated = useSyncExternalStore(
    subscribePrefsHydrated,
    getPrefsHydratedSnapshot,
    () => false
  );
  const pullDoneForKeyRef = useRef<string | null>(null);
  const activePullKeyRef = useRef<string | null>(null);
  const favPushTimerRef = useRef<number | null>(null);
  const watchPushTimerRef = useRef<number | null>(null);
  const favPushingRef = useRef(false);
  const watchPushingRef = useRef(false);
  const skipNextFavPushRef = useRef(false);
  const skipNextWatchPushRef = useRef(false);
  const cloudSyncBlockedRef = useRef(false);

  const onStaleCloudSession = useCallback(() => {
    cloudSyncBlockedRef.current = true;
  }, []);

  useEffect(() => {
    if (!streamSignedIn || !accountKey || !prefsHydrated) return;
    if (pullDoneForKeyRef.current === accountKey) return;

    let cancelled = false;
    pullDoneForKeyRef.current = accountKey;
    activePullKeyRef.current = accountKey;

    const key = accountKey;

    const idleMs = onLibraryHome
      ? isMobileShellWidth()
        ? 14_000
        : 8_000
      : isMobileShellWidth()
        ? 10_000
        : 3_500;
    const cancelIdle = scheduleWhenIdle(() => {
      if (cancelled) return;
      void pullCloud();
    }, idleMs);

    async function pullCloud() {
      if (cloudSyncBlockedRef.current) return;
      let remoteFavorites: Favorite[] | null = null;
      let remoteWatch: RemoteWatchState | null = null;
      try {
        [remoteFavorites, remoteWatch] = await Promise.all([
          fetchRemoteFavorites(key),
          fetchRemoteWatchState(key),
        ]);
      } catch {
        return;
      }
      if (cancelled || activePullKeyRef.current !== key) return;

      if (remoteFavorites !== null) {
        const local = usePrefs.getState().favorites;
        const merged = mergeFavorites(local, remoteFavorites);
        if (cancelled || activePullKeyRef.current !== key) return;
        skipNextFavPushRef.current = true;
        usePrefs.getState().setFavorites(merged);

        if (merged.length !== remoteFavorites.length) {
          await pushFavorites(key, merged, {
            onStaleSession: onStaleCloudSession,
          });
        }
      }

      if (remoteWatch !== null) {
        const localRecents = usePrefs.getState().recents;
        const localResume = usePrefs.getState().vodResumeSec;
        const mergedRecents = sanitizeRecents(
          mergeRecents(localRecents, remoteWatch.recents)
        );
        const mergedResume = sanitizeVodResumeSec(
          mergeVodResumeSec(localResume, remoteWatch.vodResumeSec)
        );
        if (cancelled || activePullKeyRef.current !== key) return;
        skipNextWatchPushRef.current = true;
        usePrefs.getState().setRecents(mergedRecents);
        usePrefs.getState().setVodResumeSec(mergedResume);

        if (
          mergedRecents.length !== remoteWatch.recents.length ||
          Object.keys(mergedResume).length !==
            Object.keys(remoteWatch.vodResumeSec).length
        ) {
          await pushWatchState(key, mergedRecents, mergedResume, {
            onStaleSession: onStaleCloudSession,
          });
        }
      }
    }

    return () => {
      cancelled = true;
      if (activePullKeyRef.current === accountKey) {
        activePullKeyRef.current = null;
      }
      cancelIdle();
    };
  }, [streamSignedIn, accountKey, prefsHydrated, onStaleCloudSession, onLibraryHome]);

  useEffect(() => {
    if (!streamSignedIn || !accountKey || !prefsHydrated) return;
    const key = accountKey;

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
        state.vodResumeSec !== prev.vodResumeSec;
      if (watchChanged) {
        if (skipNextWatchPushRef.current) {
          skipNextWatchPushRef.current = false;
        } else {
          if (watchPushTimerRef.current !== null) {
            window.clearTimeout(watchPushTimerRef.current);
          }
          watchPushTimerRef.current = window.setTimeout(() => {
            watchPushTimerRef.current = null;
            if (watchPushingRef.current || cloudSyncBlockedRef.current) return;
            watchPushingRef.current = true;
            const { recents, vodResumeSec } = usePrefs.getState();
            void pushWatchState(key, recents, vodResumeSec, {
              onStaleSession: onStaleCloudSession,
            }).finally(() => {
              watchPushingRef.current = false;
            });
          }, PUSH_DEBOUNCE_MS);
        }
      }
    });

    return () => {
      unsub();
      if (favPushTimerRef.current !== null) {
        window.clearTimeout(favPushTimerRef.current);
        favPushTimerRef.current = null;
      }
      if (watchPushTimerRef.current !== null) {
        window.clearTimeout(watchPushTimerRef.current);
        watchPushTimerRef.current = null;
      }
    };
  }, [streamSignedIn, accountKey, prefsHydrated, onStaleCloudSession]);

  useEffect(() => {
    if (!streamSignedIn) {
      cloudSyncBlockedRef.current = false;
    }
  }, [streamSignedIn]);

  useEffect(() => {
    if (!accountKey) {
      pullDoneForKeyRef.current = null;
    }
  }, [accountKey]);

  return children;
}
