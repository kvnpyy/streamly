"use client";

import { mergeFavorites } from "@/lib/favorites-sync";
import { useAuth } from "@/store/auth";
import { browseAccountKey, usePrefs, type Favorite } from "@/store/preferences";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

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
}

async function pushFavorites(
  accountKey: string,
  favorites: Favorite[]
): Promise<boolean> {
  const res = await fetch(`${window.location.origin}/api/favorites`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountKey, favorites }),
  });
  return res.ok;
}

/**
 * When signed into a Stream account, merge local favorites with the server
 * copy for the active Xtream login and keep them in sync across devices.
 */
export function FavoritesSyncBootstrap({ children }: { children: ReactNode }) {
  const creds = useAuth((s) => s.creds);
  const { status } = useSession();
  const streamSignedIn = status === "authenticated";
  const accountKey = creds ? browseAccountKey(creds) : null;

  const prefsHydrated = useSyncExternalStore(
    subscribePrefsHydrated,
    getPrefsHydratedSnapshot,
    () => false
  );
  const pullDoneForKeyRef = useRef<string | null>(null);
  const pushTimerRef = useRef<number | null>(null);
  const pushingRef = useRef(false);
  const skipNextPushRef = useRef(false);

  useEffect(() => {
    if (!streamSignedIn || !accountKey || !prefsHydrated) return;
    if (pullDoneForKeyRef.current === accountKey) return;

    let cancelled = false;
    pullDoneForKeyRef.current = accountKey;

    void (async () => {
      const remote = await fetchRemoteFavorites(accountKey);
      if (cancelled || remote === null) return;

      const local = usePrefs.getState().favorites;
      const merged = mergeFavorites(local, remote);
      skipNextPushRef.current = true;
      usePrefs.getState().setFavorites(merged);

      if (merged.length !== remote.length || JSON.stringify(merged) !== JSON.stringify(remote)) {
        await pushFavorites(accountKey, merged);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [streamSignedIn, accountKey, prefsHydrated]);

  useEffect(() => {
    if (!streamSignedIn || !accountKey) return;

    const unsub = usePrefs.subscribe((state, prev) => {
      if (state.favorites === prev.favorites) return;
      if (skipNextPushRef.current) {
        skipNextPushRef.current = false;
        return;
      }

      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
      }

      pushTimerRef.current = window.setTimeout(() => {
        pushTimerRef.current = null;
        if (pushingRef.current) return;
        pushingRef.current = true;
        const favorites = usePrefs.getState().favorites;
        void pushFavorites(accountKey, favorites).finally(() => {
          pushingRef.current = false;
        });
      }, PUSH_DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [streamSignedIn, accountKey]);

  useEffect(() => {
    if (!accountKey) {
      pullDoneForKeyRef.current = null;
    }
  }, [accountKey]);

  return children;
}
