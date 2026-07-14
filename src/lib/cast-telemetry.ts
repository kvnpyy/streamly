import * as Sentry from "@sentry/nextjs";
import type { CastMetricEvent } from "@/lib/cast-metrics";

export type CastBreadcrumbEvent =
  | "cast_prep_start"
  | "cast_prep_ok"
  | "cast_prep_fail"
  | "cast_load_media"
  | "cast_playing"
  | "cast_stall"
  | "cast_idle_error"
  | "cast_session_fail"
  | "cast_resolve_ok"
  | "cast_resolve_fail";

const CLIENT_REPORTABLE: ReadonlySet<CastMetricEvent> = new Set([
  "cast_prep_ok",
  "cast_prep_fail",
  "cast_load_ok",
  "cast_playing",
  "cast_stall",
  "cast_idle_error",
  "cast_session_fail",
]);

const SENTRY_ISSUE_EVENTS: ReadonlySet<CastBreadcrumbEvent> = new Set([
  "cast_stall",
  "cast_idle_error",
]);

/** Map breadcrumb names to metrics counters where they align. */
function metricForBreadcrumb(
  event: CastBreadcrumbEvent
): CastMetricEvent | null {
  switch (event) {
    case "cast_prep_ok":
      return "cast_prep_ok";
    case "cast_prep_fail":
      return "cast_prep_fail";
    case "cast_load_media":
      return "cast_load_ok";
    case "cast_playing":
      return "cast_playing";
    case "cast_stall":
      return "cast_stall";
    case "cast_idle_error":
      return "cast_idle_error";
    case "cast_session_fail":
      return "cast_session_fail";
    default:
      return null;
  }
}

/**
 * Cast trail for Sentry + optional server funnel (`/api/cast/events`).
 * Never pass raw stream URLs or credentials.
 */
export function castBreadcrumb(
  event: CastBreadcrumbEvent,
  data?: Record<string, string | number | boolean | null | undefined>
): void {
  const safe = data ?? {};
  if (process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
    try {
      const level =
        event === "cast_stall" ||
        event === "cast_idle_error" ||
        event === "cast_prep_fail" ||
        event === "cast_session_fail"
          ? "warning"
          : "info";
      Sentry.addBreadcrumb({
        category: "cast",
        message: event,
        level,
        data: safe,
      });
      if (SENTRY_ISSUE_EVENTS.has(event)) {
        Sentry.captureMessage(`cast:${event}`, {
          level: "warning",
          tags: {
            cast_event: event,
            cast_kind: String(safe.kind ?? ""),
          },
          extra: safe,
        });
      }
    } catch {
      /* noop */
    }
  }

  const metric = metricForBreadcrumb(event);
  if (metric && CLIENT_REPORTABLE.has(metric) && typeof window !== "undefined") {
    reportCastMetric(metric, safe);
  }
}

function reportCastMetric(
  event: CastMetricEvent,
  data: Record<string, string | number | boolean | null | undefined>
): void {
  try {
    const body = JSON.stringify({
      event,
      kind: data.kind ?? undefined,
      channelId: data.channelId ?? undefined,
      resolvePath: data.resolvePath ?? undefined,
    });
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/cast/events", blob);
      return;
    }
    void fetch("/api/cast/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      /* noop */
    });
  } catch {
    /* noop */
  }
}
