import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    if (process.env.STREAM_VOD_TRANSCODE === "1") {
      const { startTranscodeCacheMaintenance } = await import(
        "./lib/vod-transcode"
      );
      startTranscodeCacheMaintenance();
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
