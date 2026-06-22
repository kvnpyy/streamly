"use client";

import { AppVersionBadge } from "@/components/AppVersionBadge";
import { BrowseMountGate } from "@/components/BrowseMountGate";
import { CommunityDiscordStrip } from "@/components/CommunityDiscordStrip";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Sidebar } from "@/components/Sidebar";
import { StreamlyOnboardingConnect } from "@/components/StreamlyOnboardingConnect";
import { TopBar } from "@/components/TopBar";
import { TvTopNav } from "@/components/TvTopNav";
import { useAuthBootstrapReady } from "@/components/AuthSessionBootstrap";
import dynamic from "next/dynamic";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { cn } from "@/lib/utils";
import { MOBILE_BOTTOM_NAV_CLEARANCE } from "@/lib/shell-layout";
import { peekAuthSessionBridge, useAuth, useAuthStoreHydrated } from "@/store/auth";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { LiveSearchProvider } from "@/lib/live-search-context";
import { LIVE_PAGE_PATH } from "@/lib/use-live-page-search";
import { usePlayerDocumentOpen } from "@/lib/use-player-open";
import { usePlayer } from "@/store/player";
import { useGeoDefaultsBootstrap } from "@/hooks/use-geo-defaults-bootstrap";

const PlayerOverlay = dynamic(
  () => import("@/components/Player").then((m) => ({ default: m.PlayerOverlay })),
  { ssr: false, loading: () => null }
);

const LiveCategoryOverlayHost = dynamic(
  () =>
    import("@/components/LiveCategoryOverlayHost").then((m) => ({
      default: m.LiveCategoryOverlayHost,
    })),
  { ssr: false, loading: () => null }
);

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const tv = useTvBrowser();
  /** Unmount browse UI during playback so EPG scans, virtual lists, and images don't compete with video. */
  const playerOpen = usePlayer((s) => s.open);
  usePlayerDocumentOpen();
  const creds = useAuth((s) => s.creds);
  const persistReady = useAuthStoreHydrated();
  const cookieReady = useAuthBootstrapReady();
  const { data: session, status: sessionStatus } = useSession();

  const authGateReady = persistReady && (cookieReady || !!creds);
  const streamlySignedIn =
    sessionStatus === "authenticated" && Boolean(session?.user);
  const sessionKnown = sessionStatus !== "loading";
  const isSearchPage = pathname === "/app/search";
  const isLivePage = pathname === LIVE_PAGE_PATH;

  useGeoDefaultsBootstrap();

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
    const restoringPlaylists =
      sessionKnown && streamlySignedIn && !creds;
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <div className="size-10 border-2 border-white/15 border-t-(--brand-2) rounded-full animate-spin" />
          <p className="text-sm text-(--text-muted)">
            {restoringPlaylists
              ? "Restoring your saved playlists…"
              : "Loading your session…"}
          </p>
        </div>
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
                : "pb-[var(--mobile-bottom-nav-clearance)] lg:pb-0"
            )}
            style={
              tv
                ? undefined
                : ({
                    ["--mobile-bottom-nav-clearance" as string]:
                      MOBILE_BOTTOM_NAV_CLEARANCE,
                  } as CSSProperties)
            }
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
          <AppVersionBadge />
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
        {isLivePage ? (
          <LiveSearchProvider>
            <main className="flex-1 min-h-0 min-w-0 overflow-y-auto">
              <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                <CommunityDiscordStrip className="mb-4" />
                <BrowseMountGate frozen={playerOpen}>{children}</BrowseMountGate>
              </div>
            </main>
          </LiveSearchProvider>
        ) : (
          <main className="flex-1 min-h-0 min-w-0 overflow-y-auto">
            <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
              <CommunityDiscordStrip className="mb-4" />
              <BrowseMountGate frozen={playerOpen}>{children}</BrowseMountGate>
            </div>
          </main>
        )}
        <PlayerOverlay />
        {isLivePage ? <LiveCategoryOverlayHost /> : null}
        <AppVersionBadge />
      </div>
    );
  }

  const mainColumn = (
    <main
      className={cn(
        "flex-1 min-w-0 min-h-screen flex flex-col",
        "pb-[var(--mobile-bottom-nav-clearance)] lg:pb-0"
      )}
      style={
        {
          ["--mobile-bottom-nav-clearance" as string]:
            MOBILE_BOTTOM_NAV_CLEARANCE,
        } as CSSProperties
      }
    >
      <TopBar />
      <div
        className={cn(
          "flex-1 px-3 sm:px-6 lg:px-8",
          isSearchPage ? "pt-1 pb-4 sm:pt-3 sm:pb-6" : "py-4 sm:py-6"
        )}
      >
        <CommunityDiscordStrip className="mb-4" />
        <BrowseMountGate frozen={playerOpen}>{children}</BrowseMountGate>
      </div>
    </main>
  );

  /* ── Desktop / mobile layout ── */
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {isLivePage ? (
        <LiveSearchProvider>{mainColumn}</LiveSearchProvider>
      ) : (
        mainColumn
      )}
      <MobileBottomNav />
      <PlayerOverlay />
      {isLivePage ? <LiveCategoryOverlayHost /> : null}
      <AppVersionBadge />
    </div>
  );
}
