"use client";

import {
  clearChunkReloadGuard,
  isChunkLoadFailure,
  reloadForStaleChunks,
} from "@/lib/chunk-load-recovery";
import { useEffect } from "react";

/**
 * After a VPS deploy, cached HTML may reference old hashed chunks. Next returns
 * 404/500 on missing `/_next/static/chunks/*` → ChunkLoadError. One hard reload fixes it.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const stableId = window.setTimeout(clearChunkReloadGuard, 10_000);

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadFailure(event.error ?? event.message)) {
        reloadForStaleChunks();
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) {
        event.preventDefault();
        reloadForStaleChunks();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.clearTimeout(stableId);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
