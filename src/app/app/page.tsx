"use client";

import dynamic from "next/dynamic";
import { HomeStaticShell } from "@/components/home/HomeStaticShell";
import {
  HOME_AUTO_RICH_DELAY_MS,
  isHomeAutoRichDisabled,
} from "@/lib/home-performance";
import { scheduleLiveBrowseUiReady } from "@/lib/live-page-performance";
import { useLivingRoomHomeLayout } from "@/lib/use-living-room-home-layout";
import { useDeferredMount } from "@/hooks/use-deferred-mount";
import { useAuth } from "@/store/auth";
import { useEffect, useState } from "react";

const HomePageLight = dynamic(
  () =>
    import("@/components/home/HomePageLight").then((m) => ({
      default: m.HomePageLight,
    })),
  { ssr: false, loading: () => <HomeStaticShell /> }
);

const HomePageRich = dynamic(
  () =>
    import("@/components/home/HomePageRich").then((m) => ({
      default: m.HomePageRich,
    })),
  { ssr: false, loading: () => null }
);

export default function HomePage() {
  const creds = useAuth((s) => s.creds)!;
  const livingRoomHome = useLivingRoomHomeLayout();
  const interactiveReady = useDeferredMount(160, 2_200);
  const [showRich, setShowRich] = useState(false);
  useEffect(() => {
    /** TV browsers: never auto-load heavy shelves — duplicates the light hub and freezes remotes. */
    if (livingRoomHome || isHomeAutoRichDisabled() || showRich || !interactiveReady) {
      return;
    }
    return scheduleLiveBrowseUiReady(
      () => setShowRich(true),
      HOME_AUTO_RICH_DELAY_MS
    );
  }, [livingRoomHome, showRich, interactiveReady]);

  if (!interactiveReady) {
    return <HomeStaticShell />;
  }

  const showRichPrompt = !showRich;
  /** Rich TV hub replaces the light shell — rendering both duplicated "Hey …" and doubled catalog work. */
  const hideLightShell = livingRoomHome && showRich;

  return (
    <>
      {!hideLightShell && (
        <HomePageLight
          creds={creds}
          showRichPrompt={showRichPrompt}
          onLoadRich={() => setShowRich(true)}
        />
      )}
      {showRich && <HomePageRich />}
    </>
  );
}
