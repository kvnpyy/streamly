import * as Sentry from "@sentry/nextjs";
import { shouldDropSentryEvent } from "@/lib/sentry-noise-filter";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment:
    process.env.SENTRY_ENVIRONMENT ??
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.NODE_ENV,
  sendDefaultPii: false,
  /**
   * Segment and poster proxies dominate request volume. Tracing them adds
   * event-loop work and quota without a useful span. Page and catalog
   * transactions stay at 5%.
   */
  tracesSampler(ctx) {
    const name = `${ctx.name ?? ""} ${ctx.request?.url ?? ""}`;
    if (/\/api\/(?:stream|img)(?:\?|$)/.test(name)) return 0;
    return process.env.NODE_ENV === "development" ? 1 : 0.05;
  },
  beforeSend(event) {
    if (shouldDropSentryEvent(event)) return null;
    return event;
  },
});
