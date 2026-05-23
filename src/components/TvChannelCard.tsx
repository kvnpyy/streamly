"use client";

import { buildImageProxy } from "@/lib/xtream";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";
import { memo, useEffect, useState } from "react";

export type TvChannelCardProps = {
  name: string;
  icon?: string;
  /** Currently airing programme title (from EPG). */
  nowPlaying?: string;
  /** 0–1 progress through the current programme. */
  nowProgress?: number;
  /** Highlight border when this channel is currently playing. */
  active?: boolean;
  onClick: () => void;
  /**
   * "tv"  — large, optimised for 3 m viewing distance (default).
   * "web" — compact, for desktop / phone shelf browsing at normal distance.
   */
  variant?: "tv" | "web";
};

// ---------------------------------------------------------------------------
// TMDB artwork hook — module-level cache so the same title fetches once per
// browser session regardless of how many cards show the same programme.
// ---------------------------------------------------------------------------

const tmdbCache = new Map<string, string | null>();

/**
 * Tracks the latest async fetch result as `{ title, url }` so we can
 * update state only from the async callback (never synchronously inside the
 * effect body, which the React Compiler flags as a cascading-render risk).
 */
function useTmdbArtwork(title: string | undefined): string | null {
  const [asyncResult, setAsyncResult] = useState<{
    title: string;
    url: string | null;
  } | null>(null);

  useEffect(() => {
    if (!title || tmdbCache.has(title)) return; // cache hit — no fetch needed

    let cancelled = false;
    fetch(`/api/artwork?title=${encodeURIComponent(title)}`)
      .then((r) => r.json())
      .then((data: { imageUrl?: string | null }) => {
        if (cancelled) return;
        const imageUrl = data?.imageUrl ?? null;
        tmdbCache.set(title, imageUrl);
        setAsyncResult({ title, url: imageUrl }); // setState only in async callback
      })
      .catch(() => {
        if (!cancelled) {
          tmdbCache.set(title, null);
          setAsyncResult({ title, url: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [title]);

  if (!title) return null;
  // Synchronous cache hit — no setState required, no extra render
  if (tmdbCache.has(title)) return tmdbCache.get(title) ?? null;
  // Async result (may be for a previous title if title just changed)
  if (asyncResult?.title === title) return asyncResult.url;
  return null;
}

// ---------------------------------------------------------------------------
// Initials fallback
// ---------------------------------------------------------------------------

function ChannelInitials({ name }: { name: string }) {
  const clean = name
    .replace(/^\[.*?\]\s*/, "")
    .replace(/^\(.*?\)\s*/, "")
    .replace(/^[A-Z]{2,4}\s*[\|:\-]\s*/i, "")
    .trim() || name;

  const words = clean.split(/[\s\-_]+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? (words[0]![0]! + words[1]![0]!).toUpperCase()
      : clean.substring(0, 2).toUpperCase();

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;

  return (
    <div
      className="w-full h-full flex items-center justify-center select-none"
      style={{ background: `hsl(${hue},38%,20%)` }}
    >
      <span
        className="text-2xl font-black tracking-tight"
        style={{ color: `hsl(${hue},60%,72%)` }}
      >
        {initials}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TvChannelCard
// ---------------------------------------------------------------------------

/**
 * Vertical poster-style channel card for the Netflix-style TV shelf.
 *
 * Layer order inside the 16:9 logo area:
 *  1. ChannelInitials (always — base colour)
 *  2. Channel logo via CSS background-image (silently hidden if URL fails)
 *  3. TMDB programme artwork (full-bleed backdrop when EPG title is known)
 *
 * The TMDB layer transforms the card into a rich "what's on now" poster
 * the moment programme data arrives, falling back gracefully to the logo.
 */
export const TvChannelCard = memo(function TvChannelCard({
  name,
  icon,
  nowPlaying,
  nowProgress,
  active,
  onClick,
  variant = "tv",
}: TvChannelCardProps) {
  const isWeb = variant === "web";
  const artworkUrl = useTmdbArtwork(nowPlaying);

  return (
    <div
      data-tv-card-root
      tabIndex={0}
      role="button"
      aria-label={`Play ${name}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative flex-shrink-0 cursor-pointer rounded-2xl overflow-hidden select-none",
        "border bg-(--bg-2)",
        "outline-none transition-all duration-150",
        isWeb ? "w-36 sm:w-40 md:w-44" : "w-52 xl:w-60 2xl:w-72",
        "hover:scale-[1.04] hover:z-10 hover:border-(--line-2)",
        "focus-visible:scale-[1.08] focus-visible:z-20",
        "focus-visible:shadow-[0_0_0_3px_rgba(124,92,255,0.7),0_0_30px_rgba(124,92,255,0.3)]",
        active
          ? "border-(--brand)/70"
          : "border-(--line) focus-visible:border-(--brand)/60"
      )}
    >
      {/* ── 16:9 logo / artwork area ── */}
      <div className="aspect-video w-full overflow-hidden relative">

        {/* Layer 1: initials — always visible as base */}
        <div className="absolute inset-0 bg-(--bg-3) flex items-center justify-center">
          <ChannelInitials name={name} />
        </div>

        {/* Layer 2: channel logo — CSS background never shows broken-image indicator */}
        {icon && (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: `url("${buildImageProxy(icon)}")`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundOrigin: "content-box",
              padding: "12px",
            }}
          />
        )}

        {/* Layer 3: TMDB programme artwork — full-bleed backdrop */}
        {artworkUrl && (
          <div
            aria-hidden
            className="absolute inset-0 transition-opacity duration-500"
            style={{
              backgroundImage: `url("${artworkUrl}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}

        {/* Bottom-fade gradient when artwork shows — keeps info strip readable */}
        {artworkUrl && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
            }}
          />
        )}
      </div>

      {/* Play overlay on focus / hover */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/22 group-focus-visible:bg-black/22 transition-all pointer-events-none">
        <div className="size-11 rounded-full bg-white/0 group-hover:bg-white/18 group-focus-visible:bg-white/18 flex items-center justify-center transition-all">
          <Play className="size-5 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 fill-current ml-0.5 transition-opacity" />
        </div>
      </div>

      {/* EPG progress bar */}
      {typeof nowProgress === "number" && nowProgress > 0 && (
        <div className="absolute bottom-[3.25rem] left-0 right-0 h-[3px] bg-white/8">
          <div
            className="h-full bg-(--brand) rounded-full"
            style={{
              width: `${Math.max(0, Math.min(1, nowProgress)) * 100}%`,
            }}
          />
        </div>
      )}

      {/* Info strip */}
      <div className={isWeb ? "px-2.5 py-2" : "px-3 py-2.5"}>
        <div
          className={cn(
            "text-(--text) truncate leading-snug",
            isWeb ? "text-xs font-semibold" : "text-sm font-bold"
          )}
        >
          {name}
        </div>
        {nowPlaying ? (
          <div
            className={cn(
              "text-(--brand-2) truncate mt-1 leading-snug",
              isWeb ? "text-[11px]" : "text-xs"
            )}
          >
            {nowPlaying}
          </div>
        ) : (
          <div
            className={cn(
              "mt-1 flex items-center gap-1.5 text-(--text-muted)",
              isWeb ? "text-[11px]" : "text-xs"
            )}
          >
            <span className="size-1.5 rounded-full bg-(--danger) animate-pulse inline-block shrink-0" />
            Live
          </div>
        )}
      </div>
    </div>
  );
},
(prev, next) =>
  prev.name === next.name &&
  prev.icon === next.icon &&
  prev.nowPlaying === next.nowPlaying &&
  prev.nowProgress === next.nowProgress &&
  prev.active === next.active &&
  prev.variant === next.variant
);
