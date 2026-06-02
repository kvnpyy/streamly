/**
 * Lightweight runtime performance telemetry (Performance API + rAF FPS).
 * Enable HUD via NEXT_PUBLIC_PERF_HUD=1
 */

export type PerfSnapshot = {
  fps: number;
  longTasks1m: number;
  lastLongTaskMs: number;
  jsHeapUsedMb: number | null;
  jsHeapLimitMb: number | null;
  lcpMs: number | null;
  inpMs: number | null;
};

type Listener = (snap: PerfSnapshot) => void;

const listeners = new Set<Listener>();
let started = false;
let rafId = 0;
let frames = 0;
let lastFpsAt = 0;
let fps = 60;
let longTasks1m = 0;
let lastLongTaskMs = 0;
let lcpMs: number | null = null;
let inpMs: number | null = null;

const snap: PerfSnapshot = {
  fps: 60,
  longTasks1m: 0,
  lastLongTaskMs: 0,
  jsHeapUsedMb: null,
  jsHeapLimitMb: null,
  lcpMs: null,
  inpMs: null,
};

function readHeap(): { used: number | null; limit: number | null } {
  const mem = (
    typeof window !== "undefined"
      ? (window as Window & {
          performance?: Performance & {
            memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
          };
        }).performance?.memory
      : undefined
  ) as { usedJSHeapSize?: number; jsHeapSizeLimit?: number } | undefined;
  if (!mem?.usedJSHeapSize) return { used: null, limit: null };
  return {
    used: Math.round(mem.usedJSHeapSize / 1048576),
    limit: mem.jsHeapSizeLimit
      ? Math.round(mem.jsHeapSizeLimit / 1048576)
      : null,
  };
}

function emit(): void {
  const heap = readHeap();
  snap.fps = fps;
  snap.longTasks1m = longTasks1m;
  snap.lastLongTaskMs = lastLongTaskMs;
  snap.jsHeapUsedMb = heap.used;
  snap.jsHeapLimitMb = heap.limit;
  snap.lcpMs = lcpMs;
  snap.inpMs = inpMs;
  for (const fn of listeners) fn({ ...snap });
}

function rafLoop(now: number): void {
  frames += 1;
  if (now - lastFpsAt >= 1000) {
    fps = Math.round((frames * 1000) / (now - lastFpsAt));
    frames = 0;
    lastFpsAt = now;
    emit();
  }
  rafId = requestAnimationFrame(rafLoop);
}

function observeWebVitals(): void {
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.entryType === "largest-contentful-paint") {
          lcpMs = Math.round(e.startTime);
        }
        if (e.entryType === "event") {
          const pe = e as PerformanceEventTiming;
          const delay = pe.duration ?? pe.processingEnd - pe.startTime;
          if (delay > (inpMs ?? 0)) inpMs = Math.round(delay);
        }
        if (e.entryType === "longtask") {
          longTasks1m += 1;
          lastLongTaskMs = Math.round(e.duration);
        }
      }
      emit();
    });
    po.observe({
      type: "longtask",
      buffered: true,
    } as PerformanceObserverInit);
    try {
      po.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* Safari */
    }
    try {
      po.observe({ type: "event", buffered: true } as PerformanceObserverInit);
    } catch {
      /* optional */
    }
  } catch {
    /* unsupported */
  }

  window.setInterval(() => {
    longTasks1m = 0;
  }, 60_000);
}

export function isPerfHudEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_PERF_HUD?.trim();
  return v === "1" || v === "true";
}

export function startPerformanceMonitor(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  lastFpsAt = performance.now();
  rafId = requestAnimationFrame(rafLoop);
  observeWebVitals();
}

export function stopPerformanceMonitor(): void {
  if (!started) return;
  started = false;
  cancelAnimationFrame(rafId);
  listeners.clear();
}

export function subscribePerformanceMonitor(fn: Listener): () => void {
  startPerformanceMonitor();
  listeners.add(fn);
  fn({ ...snap });
  return () => listeners.delete(fn);
}

/** Mark a custom long operation for DevTools timeline. */
export function perfMark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    /* noop */
  }
}

export function perfMeasure(name: string, start: string, end?: string): void {
  try {
    performance.measure(name, start, end);
  } catch {
    /* noop */
  }
}
