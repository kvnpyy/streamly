/** Warm the programme guide chunk before the user switches views. */
export function prefetchLiveGuideChunk(): void {
  if (typeof window === "undefined") return;
  void import("@/components/LiveGuide");
}
