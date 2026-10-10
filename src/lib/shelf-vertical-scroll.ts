/**
 * Horizontal channel rows use overflow-x and touch-action that swallow a
 * vertical trackpad gesture. When the gesture is mostly vertical, the page
 * (or the nearest vertical scroller) should move instead.
 */

/** DOM_DELTA_LINE */
const DELTA_LINE = 1;
/** DOM_DELTA_PAGE */
const DELTA_PAGE = 2;
const LINE_PX = 16;

export function shelfWheelScrollsPage(deltaX: number, deltaY: number): boolean {
  if (deltaY === 0) return false;
  return Math.abs(deltaY) >= Math.abs(deltaX);
}

export function wheelDeltaToPixels(
  delta: number,
  deltaMode: number,
  viewportHeight: number
): number {
  if (deltaMode === DELTA_LINE) return delta * LINE_PX;
  if (deltaMode === DELTA_PAGE) return delta * viewportHeight;
  return delta;
}

export function findVerticalScrollParent(start: HTMLElement): HTMLElement | null {
  let node = start.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    const canScroll =
      overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    if (canScroll && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return null;
}

export function scrollVerticalFrom(from: HTMLElement, deltaY: number): void {
  const parent = findVerticalScrollParent(from);
  if (parent) {
    parent.scrollTop += deltaY;
    return;
  }
  window.scrollBy(0, deltaY);
}
