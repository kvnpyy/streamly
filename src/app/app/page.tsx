"use client";

import dynamic from "next/dynamic";
import { TvMainHub } from "@/components/tv/TvMainHub";
import { HomeStaticShell } from "@/components/home/HomeStaticShell";
import {
  HOME_AUTO_RICH_DELAY_MS,
  isHomeAutoRichDisabled,
} from "@/lib/home-performance";
import { scheduleLiveBrowseUiReady } from "@/lib/live-page-performance";
import { useTvSimpleMode } from "@/lib/tv-simple-mode";
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
  const creds = useAuth((s) => s.creds);
  const tvSimple = useTvSimpleMode();
  const interactiveReady = useDeferredMount(160, 2_200);
  const [showRich, setShowRich] = useState(false);

  useEffect(() => {
    if (tvSimple || isHomeAutoRichDisabled() || showRich || !interactiveReady) {
      return;
    }
    return scheduleLiveBrowseUiReady(
      () => setShowRich(true),
      HOME_AUTO_RICH_DELAY_MS
    );
  }, [tvSimple, showRich, interactiveReady]);

  if (tvSimple) {
    return <TvMainHub />;
  }

  if (!creds) {
    return <HomeStaticShell />;
  }

  if (!interactiveReady) {
    return <HomeStaticShell />;
  }

  const showRichPrompt = !showRich;

  return (
    <>
      <HomePageLight
        creds={creds}
        showRichPrompt={showRichPrompt}
        onLoadRich={() => setShowRich(true)}
      />
      {showRich && <HomePageRich />}
    </>
  );
}
