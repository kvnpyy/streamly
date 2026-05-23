"use client";

import { xtream } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { restoreAuthSessionBridge, useAuth } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { getSession } from "next-auth/react";
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
  const pathname = usePathname();

  /** Re-apply after login → /app SPA nav (Providers does not remount). */
  useLayoutEffect(() => {
    restoreAuthSessionBridge();
  }, [pathname]);

  useEffect(() => {
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
          useAuth.getState().setCreds(creds);
          finish();
          void validateAccount(creds);
          return;
        }

        /**
         * Signed-in Stream user but no IPTV cookie (new device, cleared cookies,
         * or cookie rotation). Re-activate the most recently used saved provider
         * (GET list is ordered by `updatedAt` desc) so /app loads without retyping.
         */
        const stream = await getSession();
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

        const actR = await fetch(
          `${window.location.origin}/api/provider-accounts/${encodeURIComponent(chosenId)}/activate`,
          { method: "POST", credentials: "include" }
        );
        if (!actR.ok) {
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
          useAuth.getState().setCreds(creds);
          usePrefs.getState().setActiveSavedProviderAccountId(chosenId);
          finish();
          void validateAccount(creds);
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
  }, []);

  return (
    <AuthBootstrapReadyContext.Provider value={ready}>
      {children}
    </AuthBootstrapReadyContext.Provider>
  );
}
