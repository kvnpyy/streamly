"use client";

import type { AuthResponse, XtreamCredentials } from "@/lib/xtream-types";
import { normalizeServer } from "@/lib/utils";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { usePrefs } from "@/store/preferences";

/** Never throw — iOS Private / quota / WebKit can throw on localStorage access. */
function safeLocalStorage(): Storage {
  if (typeof window === "undefined") {
    const noop = () => {};
    return {
      length: 0,
      clear: noop,
      getItem: () => null,
      key: () => null,
      removeItem: noop,
      setItem: noop,
    } as Storage;
  }
  const ls = window.localStorage;
  return {
    get length() {
      try {
        return ls.length;
      } catch {
        return 0;
      }
    },
    clear() {
      try {
        ls.clear();
      } catch {
        /* noop */
      }
    },
    getItem(key: string) {
      try {
        return ls.getItem(key);
      } catch {
        return null;
      }
    },
    key(index: number) {
      try {
        return ls.key(index);
      } catch {
        return null;
      }
    },
    removeItem(key: string) {
      try {
        ls.removeItem(key);
      } catch {
        /* noop */
      }
    },
    setItem(key: string, value: string) {
      try {
        ls.setItem(key, value);
      } catch {
        /* noop */
      }
    },
  };
}

type AuthState = {
  creds: XtreamCredentials | null;
  account: AuthResponse | null;
  setCreds: (c: XtreamCredentials) => void;
  setAccount: (a: AuthResponse | null) => void;
  signOut: () => void;
};

/**
 * Survives `window.location.assign` when localStorage persist fails or races on iOS Safari.
 * Applied synchronously when this module loads on the client (before first paint).
 */
export const AUTH_SESSION_BRIDGE_KEY = "iptv-auth-bridge-v1";

/** ~10 min — survives slow mobile navigations and cookie races after hard reload. */
const BRIDGE_MAX_AGE_MS = 600_000;

export function writeAuthSessionBridge(
  creds: XtreamCredentials,
  account: AuthResponse
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      AUTH_SESSION_BRIDGE_KEY,
      JSON.stringify({ creds, account, at: Date.now() })
    );
  } catch {
    /* quota / private mode */
  }
}

/** Read bridge without removing — used by persist merge + restore (Safari / hard reload). */
export function peekAuthSessionBridge(): {
  creds: XtreamCredentials;
  account: AuthResponse | null;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_BRIDGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      creds?: XtreamCredentials;
      account?: AuthResponse | null;
      at?: number;
    };
    if (!parsed.creds || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > BRIDGE_MAX_AGE_MS) {
      sessionStorage.removeItem(AUTH_SESSION_BRIDGE_KEY);
      return null;
    }
    return { creds: parsed.creds, account: parsed.account ?? null };
  } catch {
    return null;
  }
}

export function clearAuthSessionBridge(): void {
  try {
    sessionStorage.removeItem(AUTH_SESSION_BRIDGE_KEY);
  } catch {
    /* noop */
  }
}

export const useAuth = create<AuthState>()(
  persist(
    (set, _get, api) => ({
      creds: null,
      account: null,
      setCreds: (creds) =>
        set({
          creds: {
            server: normalizeServer(creds.server),
            username: creds.username.trim(),
            password: creds.password,
          },
        }),
      setAccount: (account) => set({ account }),
      signOut: () => {
        clearAuthSessionBridge();
        try {
          usePrefs.getState().setActiveSavedProviderAccountId(null);
        } catch {
          /* prefs not ready */
        }
        if (typeof window !== "undefined") {
          void fetch(`${window.location.origin}/api/iptv/session`, {
            method: "DELETE",
            credentials: "same-origin",
          }).catch(() => {});
          try {
            api.persist.clearStorage();
          } catch {
            /* noop */
          }
        }
        set({ creds: null, account: null });
      },
    }),
    {
      name: "iptv-auth",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage()),
      partialize: (state) => ({
        creds: state.creds,
        account: state.account,
      }),
      /**
       * Default shallow merge lets a late hydration pass overwrite a session the user
       * just set in memory (common on mobile Safari when submit races persist).
       */
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as Partial<AuthState>;
        const bridge = peekAuthSessionBridge();
        return {
          ...currentState,
          ...p,
          creds:
            currentState.creds ??
            bridge?.creds ??
            p.creds ??
            null,
          account:
            currentState.account ??
            bridge?.account ??
            p.account ??
            null,
        };
      },
    }
  )
);

/** Run once at startup + optional extra call from Providers (idempotent). */
export function restoreAuthSessionBridge(): void {
  if (typeof window === "undefined") return;
  const bridge = peekAuthSessionBridge();
  if (!bridge) return;
  useAuth.setState({
    creds: bridge.creds,
    account: bridge.account,
  });
}

if (typeof window !== "undefined") {
  restoreAuthSessionBridge();
}

/**
 * Max wait for persist. Zustand does not call `onFinishHydration` if `getItem` rejects
 * (Private mode / quota / storage blocked on iOS) — must never block the app forever.
 */
const HYDRATION_FALLBACK_MS = 900;

/**
 * True after iptv-auth has been read from localStorage (or timed out / errored).
 */
export function useAuthStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      setHydrated(true);
    };

    const timer = window.setTimeout(done, HYDRATION_FALLBACK_MS);

    try {
      const p = useAuth.persist;
      if (typeof p?.hasHydrated === "function" && p.hasHydrated()) {
        window.clearTimeout(timer);
        done();
        return () => window.clearTimeout(timer);
      }
      const unsub =
        typeof p?.onFinishHydration === "function"
          ? p.onFinishHydration(() => {
              window.clearTimeout(timer);
              done();
            })
          : undefined;
      return () => {
        window.clearTimeout(timer);
        unsub?.();
      };
    } catch {
      window.clearTimeout(timer);
      done();
      return () => window.clearTimeout(timer);
    }
  }, []);

  return hydrated;
}
