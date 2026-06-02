"use client";

import {
  subscribeTmdbArtworkCache,
  tmdbArtworkCache,
} from "@/lib/tmdb-artwork-cache";
import { useEffect, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Programme title → TMDB backdrop/poster URL (via /api/artwork).
 * Module-level cache dedupes concurrent cards showing the same show.
 */
export function useTmdbArtwork(title: string | undefined): string | null {
  const cacheKey = title?.trim() || "";

  useSyncExternalStore(
    cacheKey ? subscribeTmdbArtworkCache : noopSubscribe,
    () => (cacheKey ? tmdbArtworkCache.size : 0),
    () => 0
  );

  const [asyncResult, setAsyncResult] = useState<{
    title: string;
    url: string | null;
  } | null>(null);

  useEffect(() => {
    if (!cacheKey || tmdbArtworkCache.has(cacheKey)) return;

    let cancelled = false;
    fetch(`/api/artwork?title=${encodeURIComponent(cacheKey)}`)
      .then((r) => r.json())
      .then((data: { imageUrl?: string | null }) => {
        if (cancelled) return;
        const imageUrl = data?.imageUrl ?? null;
        tmdbArtworkCache.set(cacheKey, imageUrl);
        setAsyncResult({ title: cacheKey, url: imageUrl });
      })
      .catch(() => {
        if (!cancelled) {
          tmdbArtworkCache.set(cacheKey, null);
          setAsyncResult({ title: cacheKey, url: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  if (!cacheKey) return null;
  if (tmdbArtworkCache.has(cacheKey)) return tmdbArtworkCache.get(cacheKey) ?? null;
  if (asyncResult?.title === cacheKey) return asyncResult.url;
  return null;
}
