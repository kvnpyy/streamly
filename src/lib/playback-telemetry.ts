import * as Sentry from "@sentry/nextjs";

export type PlaybackBreadcrumbEvent =
  | "stall_soft_recover"
  | "try_again_soft"
  | "try_again_full"
  | "playback_error"
  | "manifest_parsed"
  | "tv_live_freeze_gentle"
  | "tv_live_freeze_soft"
  | "tv_live_freeze_reinit";

/** Lightweight playback trail for Sentry — no credentials or raw upstream URLs. */
export function playbackBreadcrumb(
  event: PlaybackBreadcrumbEvent,
  data?: Record<string, string | number | boolean | null | undefined>
): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return;
  try {
    Sentry.addBreadcrumb({
      category: "playback",
      message: event,
      level: event === "playback_error" ? "warning" : "info",
      data: data ?? {},
    });
  } catch {
    /* noop */
  }
}
