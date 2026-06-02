"use client";

import { isLivingRoomClient, isCoarsePointerLargeScreen } from "@/lib/living-room-detect";
import { isSamsungTvUserAgent } from "@/lib/tv-user-agent";
import { usePrefs } from "@/store/preferences";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const TvBrowserContext = createContext(false);

/** TV shell: no sidebar, TvTopNav, spatial nav, living-room CSS. */
export function useTvBrowser(): boolean {
  return useContext(TvBrowserContext);
}

function subscribeCoarsePointer(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(pointer: coarse) and (min-width: 1024px)");
  const onChange = () => callback();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function TvBrowserProvider({ children }: { children: ReactNode }) {
  const comfortTvBrowsing = usePrefs((s) => s.comfortTvBrowsing);

  const coarsePointerTv = useSyncExternalStore(
    subscribeCoarsePointer,
    () => isCoarsePointerLargeScreen(),
    () => false
  );

  const livingRoomShell = useSyncExternalStore(
    subscribeCoarsePointer,
    () => isLivingRoomClient(comfortTvBrowsing),
    () => false
  );

  const samsungTv = useSyncExternalStore(
    () => () => {},
    () =>
      typeof navigator !== "undefined" &&
      isSamsungTvUserAgent(navigator.userAgent || ""),
    () => false
  );

  useEffect(() => {
    const root = document.documentElement;
    if (livingRoomShell) {
      root.dataset.tv = "true";
      root.dataset.livingRoom = "true";
      root.classList.add("tv-browser");
    } else {
      delete root.dataset.tv;
      delete root.dataset.livingRoom;
      root.classList.remove("tv-browser");
    }
    if (comfortTvBrowsing || coarsePointerTv) root.dataset.tvComfort = "true";
    else delete root.dataset.tvComfort;
    if (samsungTv) root.dataset.samsungTv = "true";
    else delete root.dataset.samsungTv;
  }, [livingRoomShell, comfortTvBrowsing, coarsePointerTv, samsungTv]);

  return (
    <TvBrowserContext.Provider value={livingRoomShell}>
      {children}
    </TvBrowserContext.Provider>
  );
}
