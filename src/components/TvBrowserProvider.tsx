"use client";

import {
  isCoarsePointerLargeScreen,
  isLivingRoomClient,
  isNativeTvUa,
} from "@/lib/living-room-detect";
import {
  isLivingRoomClientSnapshot,
  isLivingRoomServerSnapshot,
  useTvServerHints,
} from "@/lib/tv-server-hints";
import { isSamsungTvUserAgent } from "@/lib/tv-user-agent";
import { usePrefs } from "@/store/preferences";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const LivingRoomShellContext = createContext(false);
const NativeTvUaContext = createContext(false);

/** TV shell: no sidebar, TvTopNav, spatial nav, living-room CSS. */
export function useLivingRoomShell(): boolean {
  return useContext(LivingRoomShellContext);
}

/** Native TV / console UA (Tizen, webOS, Fire TV class, etc.). */
export function useNativeTvUa(): boolean {
  return useContext(NativeTvUaContext);
}

/**
 * @deprecated Prefer {@link useLivingRoomShell} for layout/chrome or
 * {@link useNativeTvUa} for TV-class playback tuning.
 */
export function useTvBrowser(): boolean {
  return useLivingRoomShell();
}

function subscribeCoarsePointer(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(pointer: coarse) and (min-width: 1024px)");
  const onChange = () => callback();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function TvBrowserProvider({ children }: { children: ReactNode }) {
  const hints = useTvServerHints();
  const comfortTvBrowsing = usePrefs((s) => s.comfortTvBrowsing);

  const coarsePointerTv = useSyncExternalStore(
    subscribeCoarsePointer,
    () => isCoarsePointerLargeScreen(),
    () => false
  );

  const livingRoomShell = useSyncExternalStore(
    subscribeCoarsePointer,
    () => isLivingRoomClientSnapshot(hints, comfortTvBrowsing),
    () => isLivingRoomServerSnapshot(hints)
  );

  const nativeTvUa = useSyncExternalStore(
    () => () => {},
    () => isNativeTvUa(),
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
    if (nativeTvUa) root.dataset.nativeTv = "true";
    else delete root.dataset.nativeTv;
  }, [livingRoomShell, comfortTvBrowsing, coarsePointerTv, samsungTv, nativeTvUa]);

  return (
    <LivingRoomShellContext.Provider value={livingRoomShell}>
      <NativeTvUaContext.Provider value={nativeTvUa}>
        {children}
      </NativeTvUaContext.Provider>
    </LivingRoomShellContext.Provider>
  );
}
