"use client";

import { BrandMark } from "@/components/BrandMark";
import { UserContentDisclaimer } from "@/components/UserContentDisclaimer";
import { useAuthBootstrapReady } from "@/components/AuthSessionBootstrap";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-brand";
import { useAuth, useAuthStoreHydrated } from "@/store/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

export default function RootGate() {
  const router = useRouter();
  const creds = useAuth((s) => s.creds);
  const persistReady = useAuthStoreHydrated();
  const cookieReady = useAuthBootstrapReady();
  const { data: session, status: sessionStatus } = useSession();
  const streamlySignedIn =
    sessionStatus === "authenticated" && Boolean(session?.user);

  useEffect(() => {
    if (!persistReady || (!cookieReady && !creds)) return;

    if (creds) {
      router.replace("/app");
      const id = window.setTimeout(() => {
        const p = window.location.pathname;
        if (p === "/" || p === "") window.location.assign("/app");
      }, 1000);
      return () => window.clearTimeout(id);
    }

    /** Wait for Auth.js session — otherwise Streamly-only users get bounced to /login and never see /app onboarding. */
    if (sessionStatus === "loading") return;

    if (streamlySignedIn) {
      router.replace("/app");
      const id = window.setTimeout(() => {
        const p = window.location.pathname;
        if (p === "/" || p === "") window.location.assign("/app");
      }, 1000);
      return () => window.clearTimeout(id);
    }

    // Hard navigation: client router.replace often fails or stalls on some mobile browsers.
    window.location.replace("/login");
  }, [
    persistReady,
    cookieReady,
    creds,
    router,
    sessionStatus,
    streamlySignedIn,
  ]);

  /** Last resort if bootstrap regresses — never leave users on “Starting…” forever. */
  useEffect(() => {
    if (!persistReady) return;
    const id = window.setTimeout(() => {
      if (
        window.location.pathname !== "/" &&
        window.location.pathname !== ""
      ) {
        return;
      }
      if (!cookieReady && !creds) {
        window.location.replace("/login");
      }
    }, 16_000);
    return () => window.clearTimeout(id);
  }, [persistReady, cookieReady, creds, sessionStatus, streamlySignedIn]);

  const gateOk = persistReady && (cookieReady || !!creds);
  const signedIn = gateOk && !!creds;
  const sessionPending = gateOk && !creds && sessionStatus === "loading";

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-10">
      <header className="w-full max-w-lg text-center space-y-3 mb-8">
        <div className="flex flex-col items-center gap-3">
          <BrandMark size={11} />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-(--text)">
              {SITE_NAME}
            </h1>
            <p className="text-sm text-(--text-muted) mt-0.5">{SITE_TAGLINE}</p>
          </div>
        </div>
        <UserContentDisclaimer />
      </header>

      <div className="flex flex-col items-center gap-6 max-w-sm w-full text-center flex-1 justify-center">
        <div className="size-10 border-2 border-white/15 border-t-(--brand-2) rounded-full animate-spin shrink-0" />
        <div className="space-y-2">
          <p className="text-sm text-(--text) font-medium">
            {!gateOk
              ? "Starting…"
              : sessionPending
                ? "Checking account…"
                : creds
                  ? "Opening your library…"
                  : streamlySignedIn
                    ? "Opening the app…"
                    : "Sign in on this device"}
          </p>
          {!signedIn && !sessionPending && (
            <p className="text-xs text-(--text-muted) leading-relaxed">
              Logins are saved per phone or browser — your Mac doesn&apos;t share them
              automatically. Use the same Xtream server, username, and password.
            </p>
          )}
        </div>
        {!signedIn && !sessionPending && !streamlySignedIn && (
          <>
            {/* Hard navigation only — works when client routing or chunk loads fail on TV / LAN dev */}
            <a
              href="/login"
              className="inline-flex items-center justify-center rounded-xl btn-brand px-8 py-3.5 text-white font-semibold text-base min-h-12 w-full max-w-xs shadow-[0_12px_40px_rgba(124,92,255,0.35)]"
            >
              Continue to sign in
            </a>
            <p className="text-[11px] text-(--text-muted)">
              Uses a full page load so it works across devices and networks.
            </p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-(--text-muted)">
              <Link href="/legal/terms" className="underline underline-offset-2 hover:text-(--text)">
                Terms
              </Link>
              <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-(--text)">
                Privacy
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
