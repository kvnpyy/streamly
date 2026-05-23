"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ backgroundColor: "#06070b", color: "#eef0f6" }}>
        {/*
          App Router does not expose HTTP status for render errors; NextError
          still expects a numeric code for typings.
        */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
