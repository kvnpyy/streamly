/** True when a keyboard event originated from the player toolbar (not the bare video). */
export function isPlayerControlKeyboardTarget(
  target: EventTarget | null
): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { closest?: (selector: string) => Element | null };
  if (typeof el.closest !== "function") return false;
  return !!el.closest("[data-player-controls]");
}

/** Keys TV remotes often send as “OK” alongside a control `click`. */
export function isRemoteActivateKey(key: string): boolean {
  return key === " " || key === "Enter";
}

/** Keys that should toggle play/pause when focus is on the video surface. */
export function isPlayPauseShortcutKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    isRemoteActivateKey(key) ||
    k === "k" ||
    key === "MediaPlayPause" ||
    key === "MediaPause" ||
    key === "MediaPlay"
  );
}

/**
 * Remote “channel zap” keys → flip delta (-1 / +1), or null if not a channel key.
 * Handles legacy `keyCode` values seen on Samsung/LG webviews.
 */
export function liveChannelFlipKeyDelta(
  key: string,
  keyCode?: number
): -1 | 1 | null {
  switch (key) {
    case "ChannelUp":
    case "MediaChannelUp":
    case "PageUp":
    case "ArrowUp":
      return -1;
    case "ChannelDown":
    case "MediaChannelDown":
    case "PageDown":
    case "ArrowDown":
      return 1;
    case "MediaTrackNext":
      return 1;
    case "MediaTrackPrevious":
      return -1;
    default:
      break;
  }
  if (keyCode === 427 || keyCode === 33) return -1;
  if (keyCode === 428 || keyCode === 34) return 1;
  return null;
}
