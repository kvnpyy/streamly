"use client";

import { buildStreamByIdMap } from "@/lib/live-stream-filter";
import type { LiveStream } from "@/lib/xtream-types";
import { useEffect, useState } from "react";

const STREAM_MAP_CHUNK = 5_000;

/**
 * Builds stream_id → row map in idle chunks so a 50k+ catalog never blocks one frame.
 */
export function useChunkedStreamById(
  streams: LiveStream[] | undefined,
  indexKey: string
) {
  const [map, setMap] = useState<Map<number, LiveStream>>(() => new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!streams?.length) {
      queueMicrotask(() => {
        setMap(new Map());
        setReady(false);
      });
      return;
    }

    let cancelled = false;
    const list = streams;
    queueMicrotask(() => {
      setMap(new Map());
      setReady(false);
    });

    if (list.length <= STREAM_MAP_CHUNK) {
      const built = buildStreamByIdMap(list);
      queueMicrotask(() => {
        if (!cancelled) {
          setMap(built);
          setReady(true);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const next = new Map<number, LiveStream>();
    let offset = 0;
    const step = () => {
      if (cancelled) return;
      const end = Math.min(offset + STREAM_MAP_CHUNK, list.length);
      for (let i = offset; i < end; i++) {
        const s = list[i]!;
        next.set(s.stream_id, s);
      }
      offset = end;
      if (offset < list.length) {
        setMap(new Map(next));
        requestAnimationFrame(step);
        return;
      }
      setMap(new Map(next));
      setReady(true);
    };

    requestAnimationFrame(step);
    return () => {
      cancelled = true;
    };
  }, [indexKey, streams]);

  return { streamById: map, streamByIdReady: ready };
}
