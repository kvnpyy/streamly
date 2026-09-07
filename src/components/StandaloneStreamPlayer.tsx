"use client";

import { BrandMark } from "@/components/BrandMark";
import { loadHlsModule } from "@/lib/lazy-hls";
import { SITE_NAME } from "@/lib/site-brand";
import { playbackUrlIsHls } from "@/lib/playback-url";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

function buildProxyPlaybackUrl(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const upstream = params.get("u")?.trim();
  if (!upstream || !/^https?:\/\//i.test(upstream)) return null;
  params.delete("probe");
  if (params.get("transcode") === "release") params.delete("transcode");
  return `/api/stream?${params.toString()}`;
}

export function StandaloneStreamPlayer() {
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  const streamUrl = useMemo(
    () => buildProxyPlaybackUrl(searchParams.toString()),
    [searchParams]
  );
  const isHls = streamUrl ? playbackUrlIsHls(streamUrl, false) : false;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    setError(null);

    const onVideoError = () => {
      if (!cancelled) setError("This stream could not be started.");
    };
    video.addEventListener("error", onVideoError);

    const start = async () => {
      if (!isHls) {
        video.src = streamUrl;
        void video.play().catch(() => {
          /* autoplay may require a tap */
        });
        return;
      }

      const canNative = video.canPlayType("application/vnd.apple.mpegurl");
      if (canNative && !window.MediaSource) {
        video.src = streamUrl;
        void video.play().catch(() => {});
        return;
      }

      try {
        const Hls = await loadHlsModule();
        if (cancelled) return;
        if (Hls.isSupported()) {
          const instance = new Hls({ enableWorker: true, lowLatencyMode: false });
          hls = instance;
          instance.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal && !cancelled) {
              setError("This stream could not be started.");
            }
          });
          instance.loadSource(streamUrl);
          instance.attachMedia(video);
          instance.on(Hls.Events.MANIFEST_PARSED, () => {
            void video.play().catch(() => {});
          });
          return;
        }
      } catch {
        /* fall through to native */
      }

      if (canNative) {
        video.src = streamUrl;
        void video.play().catch(() => {});
        return;
      }
      if (!cancelled) {
        setError("This browser cannot play HLS. Open the URL in VLC or Infuse.");
      }
    };

    void start();

    return () => {
      cancelled = true;
      video.removeEventListener("error", onVideoError);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [isHls, streamUrl]);

  if (!streamUrl) {
    return (
      <main className="min-h-screen grid place-items-center px-6">
        <div className="max-w-md text-center space-y-3">
          <BrandMark size={10} className="mx-auto" />
          <h1 className="text-lg font-medium">Missing stream</h1>
          <p className="text-sm text-white/55">
            This link is incomplete. Copy the TV-safe URL from the player again.
          </p>
          <Link href="/login" className="text-sm text-(--brand-2) hover:underline">
            Go to {SITE_NAME}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <BrandMark size={8} />
        <div className="text-sm text-white/80">{SITE_NAME}</div>
        <div className="text-[11px] text-white/40">Shared stream</div>
      </header>
      <div className="relative flex-1 grid place-items-center bg-black">
        <video
          ref={videoRef}
          className="w-full h-full max-h-[100dvh] bg-black"
          controls
          autoPlay
          playsInline
        />
        {error ? (
          <div className="absolute inset-0 grid place-items-center bg-black/70 px-6">
            <div className="max-w-md text-center space-y-2">
              <div className="text-red-400 text-sm">Unable to play</div>
              <p className="text-white/80 text-sm">{error}</p>
              <p className="text-[11px] text-white/45">
                Paste the same URL into VLC or Infuse if your browser cannot
                decode this channel.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
