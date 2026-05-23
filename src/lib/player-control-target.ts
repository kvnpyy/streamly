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
