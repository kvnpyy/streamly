"use client";

import { xtream } from "@/lib/xtream";
import {
  collectXtreamSidecarSubtitles,
  episodeFromSeriesInfo,
} from "@/lib/xtream-subtitles";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { PlayerSource } from "@/store/player";
import { useEffect, type RefObject } from "react";

/**
 * Load Xtream panel sidecar SRT/VTT into `<track>` elements (movies / episodes).
 * The player's native textTrack listener lists them in the captions menu.
 * Live DVB/teletext is still not available in the browser.
 */
export function usePlayerSidecarSubtitles(opts: {
  open: boolean;
  current: PlayerSource | null;
  creds: XtreamCredentials | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const { open, current, creds, videoRef } = opts;

  useEffect(() => {
    if (!open || !current || !creds || current.kind === "live") return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const added: HTMLTrackElement[] = [];
    const blobs: string[] = [];

    const run = async () => {
      try {
        let payload: unknown = null;
        if (current.kind === "movie") {
          payload = await xtream.vodInfo(creds, current.id);
        } else {
          const series = await xtream.seriesInfo(creds, current.id);
          const epId = current.streamId ?? current.id;
          payload = episodeFromSeriesInfo(series, epId) ?? series;
        }
        if (cancelled) return;
        const tracks = collectXtreamSidecarSubtitles(payload, creds.server);
        if (!tracks.length) return;

        const headers = {
          "x-iptv-server": creds.server,
          "x-iptv-username": creds.username,
          "x-iptv-password": creds.password,
        };

        for (const t of tracks) {
          const res = await fetch(
            `/api/subtitle?u=${encodeURIComponent(t.url)}`,
            { headers, cache: "no-store" }
          );
          if (cancelled) return;
          if (!res.ok) continue;
          const vtt = await res.text();
          const blob = URL.createObjectURL(
            new Blob([vtt], { type: "text/vtt" })
          );
          blobs.push(blob);
          const el = document.createElement("track");
          el.kind = "subtitles";
          el.label = t.label;
          if (t.lang) el.srclang = t.lang;
          el.src = blob;
          el.default = false;
          video.appendChild(el);
          added.push(el);
        }
      } catch {
        /* panel often omits sidecars */
      }
    };

    void run();
    return () => {
      cancelled = true;
      for (const el of added) {
        el.remove();
      }
      for (const b of blobs) {
        URL.revokeObjectURL(b);
      }
    };
  }, [open, current?.kind, current?.id, current?.streamId, creds, videoRef]);
}
