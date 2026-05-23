"use client";

import { detectTvBrowser } from "@/lib/tv-browser";
import { isAmazonSilkUserAgent } from "@/lib/tv-user-agent";
import { useSyncExternalStore } from "react";

function subscribeNoop() {
  return () => {};
}

/**
 * Living-room style home hub: real TV browsers (Tizen, webOS, Android TV, Fire TV)
 * plus **Amazon Silk** (often weak MSE / awkward remote) so `/app` can show fewer,
 * larger entry points without changing routes.
 */
export function useLivingRoomHomeLayout(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => {
      if (typeof navigator === "undefined") return false;
      const ua = navigator.userAgent || "";
      return detectTvBrowser() || isAmazonSilkUserAgent(ua);
    },
    () => false
  );
}
