import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  /** IPTV credentials may appear in URLs — keep default PII off. */
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.05,
  ignoreErrors: [
    /play\(\) request was interrupted by a call to pause\(\)/i,
    /^AbortError:/,
  ],
  beforeSend(event) {
    const err = event.exception?.values?.[0];
    const value = err?.value ?? "";
    const type = err?.type ?? "";
    if (
      type === "AbortError" ||
      /play\(\) request was interrupted/i.test(value)
    ) {
      return null;
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
