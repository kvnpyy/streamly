"use client";

import { persistIptvAfterBrowserLogin } from "@/lib/persist-iptv-session-client";
import {
  activateSavedProviderOnServer,
  fetchIptvSessionCredsFromApi,
  listSavedProviderAccounts,
  pickSavedProviderAccountId,
} from "@/lib/restore-saved-providers";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import { isMobileShellWidth } from "@/lib/shell-layout";
import { xtream } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { restoreAuthSessionBridge, useAuth } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { pollStreamSession } from "@/lib/poll-stream-session";
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

/** False until session bootstrap finishes (cookie probe + safety timeouts — never infinite). */
export function useAuthBootstrapReady() {
  return useContext(AuthBootstrapReadyContext);
}

const SESSION_VALIDATE_MS = 12000;
const SAFETY_UNBLOCK_MS = 12000;

export function AuthSessionBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();
  const syncedToServerRef = useRef<string | null>(null);

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
    if (sessionStatus === "loading") return;

    let cancelled = false;
    let safetyId: number | null = null;

    const finish = () => {
      if (cancelled) return;
      if (safetyId !== null) {
        window.clearTimeout(safetyId);
        safetyId = null;
      }
      setReady(true);
    };

    const unsub = useAuth.subscribe((state) => {
      if (state.creds) finish();
    });

    if (useAuth.getState().creds && sessionStatus !== "authenticated") {
      finish();
      return () => {
        cancelled = true;
        unsub();
        if (safetyId !== null) window.clearTimeout(safetyId);
      };
    }

    safetyId = window.setTimeout(finish, SAFETY_UNBLOCK_MS);

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
      const validateDelay = isMobileShellWidth() ? 6_000 : 2_500;
      scheduleWhenIdle(() => void validateAccount(creds), validateDelay);
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

        /**
         * Wait for NextAuth before giving up on server-side saved playlists.
         * Previously `getSession()` on first paint often returned null on a new
         * device, so restore never ran and users saw an empty library.
         */
        if (sessionStatus !== "authenticated") {
          const local = useAuth.getState().creds;
          if (local) applyCreds(local);
          else finish();
          return;
        }

        const stream = session?.user?.id
          ? session
          : await pollStreamSession(2000);
        if (cancelled || !stream?.user?.id) {
          finish();
          return;
        }

        const accounts = await listSavedProviderAccounts(origin);
        if (cancelled) return;
        if (accounts.length === 0) {
          finish();
          return;
        }

        const prefId = usePrefs.getState().activeSavedProviderAccountId;
        const chosenId = pickSavedProviderAccountId(accounts, prefId);
        if (!chosenId) {
          finish();
          return;
        }

        let activated = await activateSavedProviderOnServer(origin, chosenId);
        if (!activated) {
          await new Promise((r) => window.setTimeout(r, 1200));
          activated = await activateSavedProviderOnServer(origin, chosenId);
        }
        if (cancelled) return;
        if (!activated) {
          try {
            sessionStorage.setItem(
              "iptv-bootstrap-activate-error",
              "Could not restore your saved playlist. Try again or reconnect below."
            );
          } catch {
            /* private mode */
          }
          finish();
          return;
        }

        const restored = await fetchIptvSessionCredsFromApi(origin);
        if (cancelled) return;
        if (restored) {
          applyCreds(restored, chosenId);
          return;
        }
      } catch {
        /* offline, aborted, or non-JSON */
      }
      finish();
    };

    void run();

    return () => {
      cancelled = true;
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
