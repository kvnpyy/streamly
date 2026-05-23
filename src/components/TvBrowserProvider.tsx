"use client";

import { detectTvBrowser } from "@/lib/tv-browser";
import { usePrefs } from "@/store/preferences";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const TvBrowserContext = createContext(false);

export function useTvBrowser(): boolean {
  return useContext(TvBrowserContext);
}

export function TvBrowserProvider({ children }: { children: ReactNode }) {
  const tv = useSyncExternalStore(
    () => () => {},
    () => detectTvBrowser(),
    () => false
  );
  const comfortTvBrowsing = usePrefs((s) => s.comfortTvBrowsing);

  useEffect(() => {
    const root = document.documentElement;
    if (tv) {
      root.dataset.tv = "true";
      root.classList.add("tv-browser");
    } else {
      delete root.dataset.tv;
      root.classList.remove("tv-browser");
    }
    if (comfortTvBrowsing) root.dataset.tvComfort = "true";
    else delete root.dataset.tvComfort;
  }, [comfortTvBrowsing, tv]);

  return (
    <TvBrowserContext.Provider value={tv}>{children}</TvBrowserContext.Provider>
  );
}
