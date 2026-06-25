"use client";

import { isLivingRoomClient } from "@/lib/living-room-detect";
import { createContext, useContext, type ReactNode } from "react";

export type TvServerHints = {
  tvServerHint: boolean;
  silkHint: boolean;
};

const TvServerHintsContext = createContext<TvServerHints>({
  tvServerHint: false,
  silkHint: false,
});

export function TvServerHintsProvider({
  children,
  tvServerHint,
  silkHint,
}: TvServerHints & { children: ReactNode }) {
  return (
    <TvServerHintsContext.Provider value={{ tvServerHint, silkHint }}>
      {children}
    </TvServerHintsContext.Provider>
  );
}

export function useTvServerHints(): TvServerHints {
  return useContext(TvServerHintsContext);
}

export function isTvJoinClient(hints: TvServerHints): boolean {
  return hints.tvServerHint || hints.silkHint;
}

/** SSR + first client paint — must match for TV user agents (middleware headers). */
export function isLivingRoomServerSnapshot(hints: TvServerHints): boolean {
  return isTvJoinClient(hints);
}

export function isLivingRoomClientSnapshot(
  hints: TvServerHints,
  comfortTvBrowsing: boolean
): boolean {
  if (isTvJoinClient(hints)) return true;
  return isLivingRoomClient(comfortTvBrowsing);
}

export function defaultTvJoinTab(hints: TvServerHints): "pin" | "xtream" {
  return isTvJoinClient(hints) ? "pin" : "xtream";
}
