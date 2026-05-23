"use client";

import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Sidebar } from "@/components/Sidebar";
import { StreamlyOnboardingConnect } from "@/components/StreamlyOnboardingConnect";
import { TopBar } from "@/components/TopBar";
import { TvTopNav } from "@/components/TvTopNav";
import { useAuthBootstrapReady } from "@/components/AuthSessionBootstrap";
import dynamic from "next/dynamic";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { cn } from "@/lib/utils";
import { peekAuthSessionBridge, useAuth, useAuthStoreHydrated } from "@/store/auth";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const PlayerOverlay = dynamic(
  () => import("@/components/Player").then((m) => ({ default: m.PlayerOverlay })),
  { ssr: false, loading: () => null }
);

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const tv = useTvBrowser();
  const creds = useAuth((s) => s.creds);
  const persistReady = useAuthStoreHydrated();
  const cookieReady = useAuthBootstrapReady();
  const { data: session, status: sessionStatus } = useSession();

  const authGateReady = persistReady && (cookieReady || !!creds);
  const streamlySignedIn =
    sessionStatus === "authenticated" && Boolean(session?.user);
  const sessionKnown = sessionStatus !== "loading";
  const isSearchPage = pathname === "/app/search";

  useEffect(() => {
    if (!authGateReady || creds) return;
    if (!sessionKnown) return;
    if (streamlySignedIn) return;
    if (peekAuthSessionBridge()) return;
    router.replace("/login");
  }, [authGateReady, creds, router, sessionKnown, streamlySignedIn]);

  useEffect(() => {
    if (!authGateReady || creds) return;
    if (!sessionKnown) return;
    if (streamlySignedIn) return;
    const id = window.setTimeout(() => {
      if (peekAuthSessionBridge()) return;
      if (window.location.pathname.startsWith("/app")) {
        window.location.assign("/login");
      }
    }, 3200);
    return () => window.clearTimeout(id);
  }, [authGateReady, creds, sessionKnown, streamlySignedIn]);

  if (!authGateReady) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="size-10 border-2 border-white/15 border-t-(--brand-2) rounded-full animate-spin" />
      </div>
    );
  }

  if (!creds) {
    if (!sessionKnown) {
      return (
        <div className="min-h-screen grid place-items-center px-6">
          <div className="size-10 border-2 border-white/15 border-t-(--brand-2) rounded-full animate-spin" />
        </div>
      );
    }
    if (streamlySignedIn) {
      return (
        <div className="flex min-h-screen">
          {!tv && <Sidebar />}
          <main
            className={cn(
              "relative flex-1 min-w-0 min-h-screen flex flex-col",
              tv
                ? "pb-0"
                : "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0"
            )}
          >
            {tv ? <TvTopNav /> : <TopBar />}
            <div className="relative flex-1 min-h-0 flex flex-col">
              <div
                className="absolute inset-0 z-0 bg-(--bg-0)/70 backdrop-blur-[2px]"
                aria-hidden
              />
              <div className="relative z-10 flex-1 flex flex-col items-center justify-start sm:justify-center overflow-y-auto py-6 sm:py-10 px-3 sm:px-6">
                <StreamlyOnboardingConnect />
              </div>
            </div>
          </main>
          {!tv && <MobileBottomNav />}
          <PlayerOverlay />
        </div>
      );
    }
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="flex flex-col items-center gap-5 max-w-sm text-center">
          <div className="size-10 border-2 border-white/15 border-t-(--brand-2) rounded-full animate-spin" />
          <p className="text-xs text-(--text-muted)">
            Not signed in on this device. Use the same Xtream details as on your computer.
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-xl btn-brand px-5 py-2.5 text-white font-medium"
            onClick={(e) => {
              e.preventDefault();
              window.location.assign(`${window.location.origin}/login`);
            }}
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  /* ── TV layout: full-width, no sidebar, sticky top nav ── */
  if (tv) {
    return (
      <div className="min-h-screen flex flex-col bg-(--bg-0)">
        <TvTopNav />
        <main className="flex-1 min-h-0 min-w-0">
          {children}
        </main>
        <PlayerOverlay />
      </div>
    );
  }

  /* ── Desktop / mobile layout ── */
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className={cn(
          "flex-1 min-w-0 min-h-screen flex flex-col",
          "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0"
        )}
      >
        <TopBar />
        <div
          className={cn(
            "flex-1 px-3 sm:px-6 lg:px-8",
            isSearchPage ? "pt-1 pb-4 sm:pt-3 sm:pb-6" : "py-4 sm:py-6"
          )}
        >
          {children}
        </div>
      </main>
      <MobileBottomNav />
      <PlayerOverlay />
    </div>
  );
}
