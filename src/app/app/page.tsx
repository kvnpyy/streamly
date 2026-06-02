"use client";

import dynamic from "next/dynamic";
import { HomeStaticShell } from "@/components/home/HomeStaticShell";
import {
  HOME_AUTO_RICH_DELAY_MS,
  isHomeAutoRichEnabled,
} from "@/lib/home-performance";
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
  const interactiveReady = useDeferredMount(160, 2_200);
  const [showRich, setShowRich] = useState(false);
  const autoRich = isHomeAutoRichEnabled();

  useEffect(() => {
    if (!autoRich || showRich || !interactiveReady) return;
    const t = setTimeout(() => setShowRich(true), HOME_AUTO_RICH_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoRich, showRich, interactiveReady]);

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
