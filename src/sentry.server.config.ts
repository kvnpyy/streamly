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
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.05,
  beforeSend(event) {
    if (shouldDropSentryEvent(event)) return null;
    const tx = event.transaction;
    if (!tx?.includes("/api/stream")) return event;
    const err = event.exception?.values?.[0];
    const value = err?.value ?? "";
    const type = err?.type ?? "";
    if (
      value.includes("failed to pipe response") ||
      value.includes("other side closed") ||
      value === "terminated" ||
      type === "SocketError"
    ) {
      return null;
    }
    return event;
  },
});
