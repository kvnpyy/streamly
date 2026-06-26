import type { CSSProperties } from "react";

const SLOT_MIN = 30;
const DESKTOP_PX_PER_MIN = 4;
const DESKTOP_ROW_PX = 108;
const DESKTOP_HEADER_PX = 38;
const DESKTOP_CHANNEL_COL_PX = 336;

export type LiveGuideLayout = {
  pxPerMin: number;
  slotPx: number;
  rowPx: number;
  headerPx: number;
  channelColPx: number;
  slotGridStyle: CSSProperties;
};

export function buildLiveGuideLayout(
  livingRoom: boolean,
  compactPhone: boolean
): LiveGuideLayout {
  const pxPerMin = livingRoom ? 5.75 : DESKTOP_PX_PER_MIN;
  const slotPx = SLOT_MIN * pxPerMin;
  const channelColPx = livingRoom ? 480 : compactPhone ? 248 : DESKTOP_CHANNEL_COL_PX;
  const rowPx = livingRoom ? 148 : compactPhone ? 88 : DESKTOP_ROW_PX;
  const headerPx = livingRoom ? 60 : DESKTOP_HEADER_PX;

  const slotGridStyle: CSSProperties = {
    backgroundImage: `repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent ${slotPx - 1}px,
    color-mix(in oklab, var(--line) 50%, transparent) ${slotPx - 1}px,
    color-mix(in oklab, var(--line) 50%, transparent) ${slotPx}px
  )`,
  };

  return { pxPerMin, slotPx, rowPx, headerPx, channelColPx, slotGridStyle };
}
