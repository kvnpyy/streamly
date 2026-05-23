/** Arrow-key spatial focus for TV remote navigation between grid cards. */

export type SpatialDir = "left" | "right" | "up" | "down";

export function pickSpatialFocus(
  current: HTMLElement,
  candidates: HTMLElement[],
  dir: SpatialDir
): HTMLElement | null {
  const curRect = current.getBoundingClientRect();
  const cx = curRect.left + curRect.width / 2;
  const cy = curRect.top + curRect.height / 2;

  let best: { el: HTMLElement; score: number } | null = null;

  for (const el of candidates) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const ox = r.left + r.width / 2;
    const oy = r.top + r.height / 2;
    const dx = ox - cx;
    const dy = oy - cy;

    let inDirection = false;
    let primary: number;
    let secondary: number;

    switch (dir) {
      case "right":
        inDirection = dx > 2;
        primary = dx;
        secondary = Math.abs(dy);
        break;
      case "left":
        inDirection = dx < -2;
        primary = -dx;
        secondary = Math.abs(dy);
        break;
      case "down":
        inDirection = dy > 2;
        primary = dy;
        secondary = Math.abs(dx);
        break;
      case "up":
        inDirection = dy < -2;
        primary = -dy;
        secondary = Math.abs(dx);
        break;
    }

    if (!inDirection) continue;
    const score = secondary * 1.4 + primary;
    if (!best || score < best.score) best = { el, score };
  }

  return best?.el ?? null;
}
