"use client";

import { scheduleWhenIdle } from "@/lib/defer-idle";
import { iptvCredentialsDiffer } from "@/lib/iptv-creds-compare";
import { isMobileShellWidth } from "@/lib/shell-layout";
import {
  activateSavedProviderOnServer,
  fetchIptvSessionCredsFromApi,
  listSavedProviderAccounts,
  pickSavedProviderAccountId,
} from "@/lib/restore-saved-providers";
import { xtream } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { pollStreamSession } from "@/lib/poll-stream-session";
import { restoreAuthSessionBridge, useAuth } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { useToast } from "@/store/toast";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
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

const STALE_DEVICE_PLAYLIST_TOAST =
  "This device had an older IPTV login — switched to your saved playlist.";

export function AuthSessionBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();

  /** Re-apply after login → /app SPA nav (Providers does not remount). */
  useLayoutEffect(() => {
    restoreAuthSessionBridge();
  }, [pathname]);

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

    const applyCreds = (
      creds: XtreamCredentials,
      savedId?: string,
      opts?: { notifyStaleDevice?: boolean }
    ) => {
      useAuth.getState().setCreds(creds);
      if (savedId) {
        usePrefs.getState().setActiveSavedProviderAccountId(savedId);
      }
      if (opts?.notifyStaleDevice) {
        useToast.getState().show(STALE_DEVICE_PLAYLIST_TOAST);
      }
      finish();
      const validateDelay = isMobileShellWidth() ? 6_000 : 2_500;
      scheduleWhenIdle(() => void validateAccount(creds), validateDelay);
    };

    const restoreGuestSession = async (origin: string) => {
      const cookieCreds = await fetchIptvSessionCredsFromApi(origin);
      if (cancelled) return true;
      if (cookieCreds) {
        applyCreds(cookieCreds);
        return true;
      }
      const local = useAuth.getState().creds;
      if (local) {
        applyCreds(local);
        return true;
      }
      return false;
    };

    const restoreSignedInSession = async (origin: string) => {
      const staleDeviceCreds =
        (await fetchIptvSessionCredsFromApi(origin)) ??
        useAuth.getState().creds;

      const stream = session?.user?.id
        ? session
        : await pollStreamSession(2000);
      if (cancelled || !stream?.user?.id) {
        return false;
      }

      const { accounts, activeAccountId } =
        await listSavedProviderAccounts(origin);
      if (cancelled) return false;

      if (accounts.length === 0) {
        if (staleDeviceCreds) {
          applyCreds(staleDeviceCreds);
          return true;
        }
        return false;
      }

      const localPrefId = usePrefs.getState().activeSavedProviderAccountId;
      const chosenId = pickSavedProviderAccountId(
        accounts,
        activeAccountId ?? localPrefId
      );
      if (!chosenId) return false;

      let activated = await activateSavedProviderOnServer(origin, chosenId);
      if (!activated) {
        await new Promise((r) => window.setTimeout(r, 1200));
        activated = await activateSavedProviderOnServer(origin, chosenId);
      }
      if (cancelled) return false;
      if (!activated) {
        try {
          sessionStorage.setItem(
            "iptv-bootstrap-activate-error",
            "Could not restore your saved playlist. Try again or reconnect below."
          );
        } catch {
          /* private mode */
        }
        return false;
      }

      const restored = await fetchIptvSessionCredsFromApi(origin);
      if (cancelled) return false;
      if (!restored) return false;

      const notifyStaleDevice = iptvCredentialsDiffer(
        staleDeviceCreds,
        restored
      );
      applyCreds(restored, chosenId, { notifyStaleDevice });
      return true;
    };

    const run = async () => {
      const origin = window.location.origin;

      try {
        if (sessionStatus !== "authenticated") {
          const restored = await restoreGuestSession(origin);
          if (!restored) finish();
          return;
        }

        const restored = await restoreSignedInSession(origin);
        if (!restored) finish();
      } catch {
        finish();
      }
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
