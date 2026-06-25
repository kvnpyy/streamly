"use client";

import Link from "next/link";

export default function AppAreaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen grid place-items-center px-6 py-12">
      <div className="max-w-md w-full card p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold text-(--text)">
          Something went wrong
        </h1>
        <p className="text-sm text-(--text-muted) text-pretty">
          The player hit an unexpected error. This can happen after an update —
          try again or return home.
        </p>
        {process.env.NODE_ENV !== "production" && error?.message ? (
          <p className="text-xs text-(--danger) break-words">{error.message}</p>
        ) : null}
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="min-h-11 px-5 rounded-xl btn-brand text-sm font-medium"
          >
            Try again
          </button>
          <Link
            href="/app"
            className="min-h-11 px-5 rounded-xl border border-(--line) bg-(--bg-2) text-sm font-medium inline-flex items-center justify-center"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
