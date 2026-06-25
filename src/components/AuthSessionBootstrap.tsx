"use client";

import { xtream } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { scheduleWhenIdle } from "@/lib/defer-idle";
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
  useState,
  type ReactNode,
} from "react";

const AuthBootstrapReadyContext = createContext(false);

/** False until session bootstrap finishes (cookie probe + safety timeouts — never infinite). */
export function useAuthBootstrapReady() {
  return useContext(AuthBootstrapReadyContext);
}

const SESSION_FETCH_MS = 8000;
const SESSION_VALIDATE_MS = 12000;
const SAFETY_UNBLOCK_MS = 12000;

export function AuthSessionBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const { status: sessionStatus } = useSession();
  const pathname = usePathname();

  /** Re-apply after login → /app SPA nav (Providers does not remount). */
  useLayoutEffect(() => {
    restoreAuthSessionBridge();
  }, [pathname]);

  useEffect(() => {
    if (sessionStatus === "loading") return;

    let cancelled = false;
    /** Use `number` — `@types/node` makes `ReturnType<typeof setTimeout>` a NodeJS.Timeout. */
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

    if (useAuth.getState().creds) {
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

    const fetchSessionCreds = async (): Promise<XtreamCredentials | null> => {
      const ac = new AbortController();
      const fetchTimer: number = window.setTimeout(() => ac.abort(), SESSION_FETCH_MS);
      try {
        const r = await fetch(`${window.location.origin}/api/iptv/session`, {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        let data: { creds?: XtreamCredentials | null } = {};
        try {
          data = await r.json();
        } catch {
          data = {};
        }
        const creds = data.creds;
        if (
          creds &&
          typeof creds.server === "string" &&
          typeof creds.username === "string" &&
          typeof creds.password === "string"
        ) {
          return creds;
        }
      } finally {
        window.clearTimeout(fetchTimer);
      }
      return null;
    };

    const run = async () => {
      try {
        let creds = await fetchSessionCreds();
        if (creds) {
          const sessionCreds = creds;
          useAuth.getState().setCreds(sessionCreds);
          finish();
          scheduleWhenIdle(() => void validateAccount(sessionCreds), 2_500);
          return;
        }

        /**
         * Signed-in Stream user but no IPTV cookie (new device, cleared cookies,
         * or cookie rotation). Re-activate the most recently used saved provider
         * (GET list is ordered by `updatedAt` desc) so /app loads without retyping.
         */
        if (sessionStatus !== "authenticated") {
          finish();
          return;
        }

        const stream = await pollStreamSession(2000);
        if (cancelled || !stream?.user?.id) {
          finish();
          return;
        }

        const listR = await fetch(`${window.location.origin}/api/provider-accounts`, {
          credentials: "include",
          cache: "no-store",
        });
        const listJson = (await listR.json().catch(() => ({}))) as {
          accounts?: { id: string }[];
          error?: string;
        };
        const accounts = listJson.accounts ?? [];
        if (accounts.length === 0) {
          finish();
          return;
        }

        const prefId = usePrefs.getState().activeSavedProviderAccountId;
        const chosenId =
          typeof prefId === "string" &&
          accounts.some((a) => a.id === prefId)
            ? prefId
            : typeof accounts[0]?.id === "string"
              ? accounts[0].id
              : undefined;
        if (!chosenId) {
          finish();
          return;
        }

        const activateOnce = async () => {
          const actR = await fetch(
            `${window.location.origin}/api/provider-accounts/${encodeURIComponent(chosenId)}/activate`,
            { method: "POST", credentials: "include" }
          );
          if (actR.ok) return true;
          const actJson = (await actR.json().catch(() => ({}))) as {
            error?: string;
          };
          try {
            sessionStorage.setItem(
              "iptv-bootstrap-activate-error",
              actJson.error ||
                `Could not restore your saved playlist (${actR.status}).`
            );
          } catch {
            /* private mode */
          }
          return false;
        };

        let activated = await activateOnce();
        if (!activated) {
          await new Promise((r) => window.setTimeout(r, 1200));
          activated = await activateOnce();
        }
        if (!activated) {
          finish();
          return;
        }

        creds = await fetchSessionCreds();
        if (
          creds &&
          typeof creds.server === "string" &&
          typeof creds.username === "string" &&
          typeof creds.password === "string"
        ) {
          const activatedCreds = creds;
          useAuth.getState().setCreds(activatedCreds);
          usePrefs.getState().setActiveSavedProviderAccountId(chosenId);
          finish();
          scheduleWhenIdle(() => void validateAccount(activatedCreds), 2_500);
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
  }, [sessionStatus]);

  return (
    <AuthBootstrapReadyContext.Provider value={ready}>
      {children}
    </AuthBootstrapReadyContext.Provider>
  );
}
