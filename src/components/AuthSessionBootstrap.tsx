"use client";

import { persistIptvAfterBrowserLogin } from "@/lib/persist-iptv-session-client";
import {
  fetchIptvSessionCredsFromApi,
  restoreSavedProviderSession,
} from "@/lib/restore-saved-providers";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import { xtream } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { restoreAuthSessionBridge, useAuth } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const AuthBootstrapReadyContext = createContext(false);

/** False until session bootstrap finishes (cookie probe + saved-playlist restore — never infinite). */
export function useAuthBootstrapReady() {
  return useContext(AuthBootstrapReadyContext);
}

const SESSION_VALIDATE_MS = 12000;
/** Max wait while Streamly session or saved-playlist restore is still in flight. */
const SAFETY_UNBLOCK_MS = 28000;
const RESTORE_RETRY_MS = 2_500;

export function AuthSessionBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();
  const syncedToServerRef = useRef<string | null>(null);
  const restoreInFlightRef = useRef(false);
  const sessionStatusRef = useRef(sessionStatus);

  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  /** Re-apply after login → /app SPA nav (Providers does not remount). */
  useLayoutEffect(() => {
    restoreAuthSessionBridge();
  }, [pathname]);

  /** When Streamly signs in after a cookie-only IPTV session, persist to the server. */
  useEffect(() => {
    const uid = session?.user?.id;
    if (sessionStatus !== "authenticated" || !uid) return;
    const creds = useAuth.getState().creds;
    if (!creds) return;
    const syncKey = `${uid}:${creds.server}:${creds.username}`;
    if (syncedToServerRef.current === syncKey) return;
    syncedToServerRef.current = syncKey;
    scheduleWhenIdle(() => {
      void persistIptvAfterBrowserLogin(creds).catch(() => {
        syncedToServerRef.current = null;
      });
    }, 800);
  }, [sessionStatus, session?.user?.id]);

  useEffect(() => {
    let cancelled = false;
    let safetyId: number | null = null;

    const finish = () => {
      if (cancelled || restoreInFlightRef.current) return;
      if (safetyId !== null) {
        window.clearTimeout(safetyId);
        safetyId = null;
      }
      setReady(true);
    };

    const unsub = useAuth.subscribe((state) => {
      if (state.creds) finish();
    });

    if (useAuth.getState().creds) {
      finish();
      return () => {
        cancelled = true;
        unsub();
        if (safetyId !== null) window.clearTimeout(safetyId);
      };
    }

    safetyId = window.setTimeout(() => {
      if (restoreInFlightRef.current) return;
      if (sessionStatusRef.current === "loading") return;
      finish();
    }, SAFETY_UNBLOCK_MS);

    const validateAccount = async (creds: XtreamCredentials) => {
      try {
        const validateAc = new AbortController();
        const validateTm: number = window.setTimeout(
          () => validateAc.abort(),
          SESSION_VALIDATE_MS
        );
        try {
          const account = await xtream.authenticate(creds, {
            signal: validateAc.signal,
          });
          if (!cancelled) useAuth.getState().setAccount(account);
        } finally {
          window.clearTimeout(validateTm);
        }
      } catch {
        /* stale cookie or IPTV unreachable from this network */
      }
    };

    const applyCreds = (creds: XtreamCredentials, savedId?: string) => {
      useAuth.getState().setCreds(creds);
      if (savedId) {
        usePrefs.getState().setActiveSavedProviderAccountId(savedId);
      }
      finish();
      scheduleWhenIdle(() => void validateAccount(creds), 2_500);
    };

    const tryRestoreSaved = async (origin: string) => {
      const prefId = usePrefs.getState().activeSavedProviderAccountId;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (cancelled) return false;
        const restored = await restoreSavedProviderSession(origin, prefId);
        if (restored) {
          applyCreds(restored.creds, restored.savedId);
          return true;
        }
        if (attempt === 0) {
          await new Promise((r) => window.setTimeout(r, RESTORE_RETRY_MS));
        }
      }
      return false;
    };

    const run = async () => {
      const origin = window.location.origin;

      try {
        const cookieCreds = await fetchIptvSessionCredsFromApi(origin);
        if (cancelled) return;
        if (cookieCreds) {
          applyCreds(cookieCreds);
          return;
        }

        if (sessionStatus === "loading") return;

        if (sessionStatus !== "authenticated" || !session?.user?.id) {
          finish();
          return;
        }

        restoreInFlightRef.current = true;
        try {
          const restored = await tryRestoreSaved(origin);
          if (cancelled) return;
          if (!restored) finish();
        } finally {
          restoreInFlightRef.current = false;
        }
      } catch {
        restoreInFlightRef.current = false;
        finish();
      }
    };

    void run();

    return () => {
      cancelled = true;
      restoreInFlightRef.current = false;
      unsub();
      if (safetyId !== null) window.clearTimeout(safetyId);
    };
  }, [sessionStatus, session?.user?.id]);

  return (
    <AuthBootstrapReadyContext.Provider value={ready}>
      {children}
    </AuthBootstrapReadyContext.Provider>
  );
}
