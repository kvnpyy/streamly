"use client";

import { useAuthBootstrapReady } from "@/components/AuthSessionBootstrap";
import { useAuth } from "@/store/auth";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

/**
 * Signed-in users hitting `/` go straight to the library.
 * Unsigned visitors stay on the marketing landing (no redirect to /login).
 */
export function HomeGateRedirect() {
  const router = useRouter();
  const creds = useAuth((s) => s.creds);
  const cookieReady = useAuthBootstrapReady();
  const { data: session, status: sessionStatus } = useSession();
  const streamlySignedIn =
    sessionStatus === "authenticated" && Boolean(session?.user);

  useEffect(() => {
    if (!cookieReady && !creds) return;
    if (sessionStatus === "loading" && !creds) return;

    if (creds || streamlySignedIn) {
      router.replace("/app");
      const id = window.setTimeout(() => {
        const p = window.location.pathname;
        if (p === "/" || p === "") window.location.assign("/app");
      }, 1200);
      return () => window.clearTimeout(id);
    }
  }, [cookieReady, creds, router, sessionStatus, streamlySignedIn]);

  return null;
}
