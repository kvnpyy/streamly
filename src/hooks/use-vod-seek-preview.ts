"use client";

import {
  bucketSeekPreviewSec,
  buildVodSeekPreviewUrl,
  upstreamFromPlaybackProxyUrl,
} from "@/lib/vod-thumbnail-url";
import { useEffect, useRef, useState } from "react";

type UseVodSeekPreviewOpts = {
  playbackUrl: string;
  previewSec: number | null;
  enabled: boolean;
  poster?: string;
};

export function useVodSeekPreview({
  playbackUrl,
  previewSec,
  enabled,
  poster,
}: UseVodSeekPreviewOpts) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef(new Map<number, string>());
  const abortRef = useRef<AbortController | null>(null);
  const imageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || previewSec == null || previewSec < 0) {
      abortRef.current?.abort();
      queueMicrotask(() => {
        setLoading(false);
        imageUrlRef.current = null;
        setImageUrl(null);
      });
      return;
    }

    const upstream = upstreamFromPlaybackProxyUrl(playbackUrl);
    if (!upstream) {
      queueMicrotask(() => {
        imageUrlRef.current = poster ?? null;
        setImageUrl(poster ?? null);
      });
      return;
    }

    const bucket = bucketSeekPreviewSec(previewSec);
    const cached = cacheRef.current.get(bucket);
    if (cached) {
      queueMicrotask(() => {
        imageUrlRef.current = cached;
        setImageUrl(cached);
        setLoading(false);
      });
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    queueMicrotask(() => setLoading(true));

    const url = buildVodSeekPreviewUrl(upstream, previewSec);
    void fetch(url, { credentials: "same-origin", signal: ac.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        if (ac.signal.aborted) return;
        const objectUrl = URL.createObjectURL(blob);
        cacheRef.current.set(bucket, objectUrl);
        if (cacheRef.current.size > 48) {
          const first = cacheRef.current.keys().next().value;
          if (first != null) {
            const old = cacheRef.current.get(first);
            cacheRef.current.delete(first);
            if (
              old?.startsWith("blob:") &&
              old !== imageUrlRef.current
            ) {
              URL.revokeObjectURL(old);
            }
          }
        }
        imageUrlRef.current = objectUrl;
        setImageUrl(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setImageUrl(poster ?? null);
        setLoading(false);
      });

    return () => ac.abort();
  }, [playbackUrl, previewSec, enabled, poster]);

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      abortRef.current?.abort();
      for (const url of cache.values()) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      cache.clear();
    };
  }, []);

  return { imageUrl, loading, hasUpstream: !!upstreamFromPlaybackProxyUrl(playbackUrl) };
}
