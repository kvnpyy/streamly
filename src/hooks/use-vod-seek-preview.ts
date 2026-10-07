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

/** Wait until the pointer rests so a fast scrub does not request every frame. */
const PREVIEW_FETCH_DEBOUNCE_MS = 140;

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
      return;
    }

    const upstream = upstreamFromPlaybackProxyUrl(playbackUrl);
    if (!upstream) {
      if (poster) {
        imageUrlRef.current = poster;
        queueMicrotask(() => setImageUrl(poster));
      }
      return;
    }

    const bucket = bucketSeekPreviewSec(previewSec);
    const cached = cacheRef.current.get(bucket);
    if (cached) {
      imageUrlRef.current = cached;
      queueMicrotask(() => {
        setImageUrl(cached);
        setLoading(false);
      });
      return;
    }

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);

      const url = buildVodSeekPreviewUrl(upstream, previewSec);
      void fetch(url, { credentials: "same-origin", signal: ac.signal })
        .then((res) => {
          if (res.status === 204 || !res.ok) throw new Error(String(res.status));
          return res.blob();
        })
        .then((blob) => {
          if (ac.signal.aborted) return;
          if (blob.size < 500) throw new Error("empty");
          const objectUrl = URL.createObjectURL(blob);
          cacheRef.current.set(bucket, objectUrl);
          if (cacheRef.current.size > 48) {
            const first = cacheRef.current.keys().next().value;
            if (first != null && first !== bucket) {
              const old = cacheRef.current.get(first);
              cacheRef.current.delete(first);
              // Revoke after the <img> has moved on. Revoking in the same
              // turn the src changes makes Chrome log ERR_FILE_NOT_FOUND.
              if (old?.startsWith("blob:")) {
                window.setTimeout(() => {
                  if (imageUrlRef.current !== old) URL.revokeObjectURL(old);
                }, 2000);
              }
            }
          }
          imageUrlRef.current = objectUrl;
          setImageUrl(objectUrl);
          setLoading(false);
        })
        .catch(() => {
          if (ac.signal.aborted) return;
          setLoading(false);
          if (!imageUrlRef.current && poster) {
            imageUrlRef.current = poster;
            setImageUrl(poster);
          }
        });
    }, PREVIEW_FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [playbackUrl, previewSec, enabled, poster]);

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      abortRef.current?.abort();
      const urls = [...cache.values()];
      cache.clear();
      window.setTimeout(() => {
        for (const url of urls) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        }
      }, 1000);
    };
  }, []);

  return { imageUrl, loading, hasUpstream: !!upstreamFromPlaybackProxyUrl(playbackUrl) };
}
