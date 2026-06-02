"use client";

import { useTmdbArtwork } from "@/hooks/use-tmdb-artwork";
import { buildImageProxy, proxiedCssBackground } from "@/lib/image-proxy";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";
import { memo } from "react";

export type TvChannelCardProps = {
  name: string;
  icon?: string;
  /** Xtream panel base URL — required when `icon` is a relative path. */
  panelServer?: string;
  /** Currently airing programme title (from EPG). */
  nowPlaying?: string;
  /** 0–1 progress through the current programme. */
  nowProgress?: number;
  /** Highlight border when this channel is currently playing. */
  active?: boolean;
  onClick: () => void;
  /** Prefetch manifest when the card is focused or hovered (faster tune-in). */
  onWarmPointer?: () => void;
  /**
   * "tv"  — large, optimised for 3 m viewing distance (default).
   * "web" — compact shelf card: logo only (no TMDB fetch — keeps "Show more" fast).
   */
  variant?: "tv" | "web";
};

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

type ChannelCardBodyProps = Omit<TvChannelCardProps, "variant"> & {
  isWeb: boolean;
  artworkUrl: string | null;
  iconBg: string | undefined;
  webIconSrc?: string;
};

const ChannelCardBody = memo(function ChannelCardBody({
  name,
  nowPlaying,
  nowProgress,
  active,
  onClick,
  onWarmPointer,
  isWeb,
  artworkUrl,
  iconBg,
  webIconSrc,
}: ChannelCardBodyProps) {
  return (
    <div
      data-tv-card-root
      tabIndex={0}
      role="button"
      aria-label={`Play ${name}`}
      onClick={onClick}
      onPointerEnter={() => onWarmPointer?.()}
      onFocus={() => onWarmPointer?.()}
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
        isWeb
          ? "hover:border-(--line-2)"
          : "hover:scale-[1.04] hover:z-10 hover:border-(--line-2)",
        isWeb
          ? "focus-visible:z-10 focus-visible:border-(--brand)/60"
          : "focus-visible:scale-[1.08] focus-visible:z-20",
        "focus-visible:shadow-[0_0_0_3px_rgba(124,92,255,0.7),0_0_30px_rgba(124,92,255,0.3)]",
        active
          ? "border-(--brand)/70"
          : "border-(--line) focus-visible:border-(--brand)/60"
      )}
    >
      <div className="aspect-video w-full overflow-hidden relative">
        <div className="absolute inset-0 bg-(--bg-3) flex items-center justify-center">
          <ChannelInitials name={name} />
        </div>
        {isWeb && webIconSrc ? (
          <img
            src={webIconSrc}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 m-auto max-h-[72%] max-w-[72%] object-contain pointer-events-none"
          />
        ) : iconBg ? (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: iconBg,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundOrigin: "content-box",
              padding: "12px",
            }}
          />
        ) : null}
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

      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/22 group-focus-visible:bg-black/22 transition-all pointer-events-none">
        <div className="size-11 rounded-full bg-white/0 group-hover:bg-white/18 group-focus-visible:bg-white/18 flex items-center justify-center transition-all">
          <Play className="size-5 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 fill-current ml-0.5 transition-opacity" />
        </div>
      </div>

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
});

/** Web shelf tiles — no TMDB hook (avoids global artwork cache re-render storms). */
const TvChannelCardWeb = memo(function TvChannelCardWeb(
  props: Omit<TvChannelCardProps, "variant">
) {
  const webIconSrc = buildImageProxy(props.icon, props.panelServer);
  return (
    <ChannelCardBody
      {...props}
      isWeb
      artworkUrl={null}
      iconBg={undefined}
      webIconSrc={webIconSrc}
    />
  );
});

const TvChannelCardTv = memo(function TvChannelCardTv(
  props: Omit<TvChannelCardProps, "variant">
) {
  const artworkUrl = useTmdbArtwork(props.nowPlaying);
  const iconBg = proxiedCssBackground(props.icon, props.panelServer);
  return (
    <ChannelCardBody
      {...props}
      isWeb={false}
      artworkUrl={artworkUrl}
      iconBg={iconBg}
    />
  );
});

export const TvChannelCard = memo(function TvChannelCard({
  variant = "tv",
  ...props
}: TvChannelCardProps) {
  if (variant === "web") {
    return <TvChannelCardWeb {...props} />;
  }
  return <TvChannelCardTv {...props} />;
});
