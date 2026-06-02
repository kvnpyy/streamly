/** Lazy-load hls.js so Library / browse routes do not pay ~200KB+ upfront. */

export type HlsConstructor = typeof import("hls.js").default;

let modulePromise: Promise<{ default: HlsConstructor }> | null = null;

export function preloadHlsModule(): void {
  if (typeof window === "undefined") return;
  void loadHlsModule();
}

export function loadHlsModule(): Promise<HlsConstructor> {
  if (!modulePromise) {
    modulePromise = import("hls.js");
  }
  return modulePromise.then((m) => m.default);
}
