"use client";

import type { ChannelMeta } from "@/lib/channel-meta";
import { cn } from "@/lib/utils";
import { buildImageProxy } from "@/lib/xtream";
import { Heart, Play } from "lucide-react";

/** Styled initials fallback — same logic as TvChannelCard/TvCategoryView. */
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
      <span className="text-sm font-black tracking-tight" style={{ color: `hsl(${hue},60%,72%)` }}>
        {initials}
      </span>
    </div>
  );
}

export type ChannelTileProps = {
  number?: number;
  name: string;
  icon?: string;
  onClick: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Currently airing program title. */
  nowPlaying?: string;
  /** Next scheduled program title. */
  nextPlaying?: string;
  /** Compact label like "23m left". Used inline with the progress bar. */
  endsIn?: string;
  /** 0..1 progress through the current program. */
  nowProgress?: number;
  /** Unix timestamps in seconds for the current program (for "6:00–9:00"). */
  nowStart?: number;
  nowEnd?: number;
  /** Unix start time of the next program. */
  nextStart?: number;
  /** Whether EPG is still loading for this tile (renders a soft shimmer). */
  epgLoading?: boolean;
  /** Optional attribution tag for the EPG source (e.g. "iptv-org" when the
   *  programme info comes from the public XMLTV fallback rather than the
   *  user's IPTV provider). Renders as a tiny chip next to "LIVE". */
  epgSourceTag?: string;
  /** Shown in place of "now playing" when no EPG is available — e.g. the
   *  category name or "Live broadcast". */
  fallbackSubtitle?: string;
  /** Parsed channel-name metadata, used as a richer "no EPG" fallback. */
  fallbackMeta?: ChannelMeta;
  active?: boolean;
};

function fmtClock(unix?: number): string {
  if (!unix || !Number.isFinite(unix)) return "";
  const d = new Date(unix * 1000);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ChannelTile({
  number,
  name,
  icon,
  onClick,
  isFavorite,
  onToggleFavorite,
  nowPlaying,
  nextPlaying,
  endsIn,
  nowProgress,
  nowStart,
  nowEnd,
  nextStart,
  epgLoading,
  epgSourceTag,
  fallbackSubtitle,
  fallbackMeta,
  active,
}: ChannelTileProps) {
  const hasEpg = Boolean(nowPlaying);

  return (
    <div
      data-tv-card-root
      className={cn(
        "group card relative overflow-hidden cursor-pointer transition-all hover:border-(--line-2) hover:bg-(--bg-3)",
        "[&:focus-visible]:z-[1]",
        active && "border-(--brand)/60 ring-1 ring-(--brand)/40 bg-(--bg-3)"
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-stretch gap-4 p-3.5">
        {/* Logo — initials always in background; logo via CSS bg-image (no broken-image indicator). */}
        <div className="relative size-16 shrink-0 rounded-xl border border-(--line) overflow-hidden">
          <div className="absolute inset-0 bg-(--bg-3)">
            <ChannelInitials name={name} />
          </div>
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
                padding: "6px",
              }}
            />
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 flex flex-col">
          {/* Top row: channel name (small, dim) + channel number + actions */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-xs font-medium text-(--text-dim) truncate uppercase tracking-wide flex-1 min-w-0">
              {name}
            </div>
            {typeof number === "number" && (
              <span className="text-[10px] font-mono text-(--text-muted) tabular-nums shrink-0">
                CH {number}
              </span>
            )}
            <div className="flex items-center gap-1 shrink-0 -mr-1">
              {onToggleFavorite && (
                <button
                  aria-label="Toggle favorite"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite();
                  }}
                  className={cn(
                    "size-7 rounded-lg grid place-items-center transition-colors",
                    isFavorite
                      ? "text-(--danger)"
                      : "text-(--text-muted) opacity-0 group-hover:opacity-100 hover:text-(--text)"
                  )}
                >
                  <Heart className={cn("size-4", isFavorite && "fill-current")} />
                </button>
              )}
              <button
                aria-label="Play"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="size-7 rounded-lg grid place-items-center bg-(--bg-3) hover:btn-brand text-(--text-dim) hover:text-white transition-colors"
              >
                <Play className="size-3.5 fill-current" />
              </button>
            </div>
          </div>

          {/* Hero: now-playing program title */}
          {hasEpg ? (
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-(--danger) shrink-0">
                <span className="size-1.5 rounded-full bg-(--danger) animate-pulse" />
                Live
              </span>
              <h3 className="text-[15px] font-semibold text-(--text) truncate min-w-0">
                {nowPlaying}
              </h3>
              {epgSourceTag && (
                <span
                  title={`Schedule via ${epgSourceTag}`}
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-px rounded bg-(--brand-2)/15 border border-(--brand-2)/30 text-(--brand-2) shrink-0"
                >
                  via {epgSourceTag}
                </span>
              )}
            </div>
          ) : epgLoading ? (
            <div className="mt-2 h-4 w-2/3 max-w-[260px] rounded skeleton" />
          ) : (
            <FallbackInfoLine meta={fallbackMeta} subtitle={fallbackSubtitle} />
          )}

          {/* Progress + time range */}
          {hasEpg && (
            <div className="mt-2 flex items-center gap-3 min-w-0">
              <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden min-w-[60px]">
                <div
                  className="h-full bg-gradient-to-r from-(--brand) to-(--brand-2) rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${Math.max(0, Math.min(1, nowProgress ?? 0)) * 100}%`,
                  }}
                />
              </div>
              <div className="text-[11px] tabular-nums text-(--text-muted) shrink-0 flex items-center gap-1.5">
                {nowStart && nowEnd ? (
                  <span>
                    {fmtClock(nowStart)} – {fmtClock(nowEnd)}
                  </span>
                ) : null}
                {endsIn && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="text-(--text-dim) font-medium">{endsIn}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Next program */}
          {hasEpg && nextPlaying && (
            <div className="mt-2 flex items-center gap-2 text-[12px] min-w-0">
              <span className="text-(--text-muted) uppercase tracking-wider text-[10px] font-semibold shrink-0">
                Next
              </span>
              <span className="text-(--text-dim) truncate min-w-0 flex-1">
                {nextPlaying}
              </span>
              {nextStart && (
                <span className="text-(--text-muted) tabular-nums text-[11px] shrink-0">
                  {fmtClock(nextStart)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FallbackInfoLine({
  meta,
  subtitle,
}: {
  meta?: ChannelMeta;
  subtitle?: string;
}) {
  // Build a compact list of pills to display. We show a small "ON AIR"
  // marker, then any combination of: country flag, network, topic emoji
  // + topic, quality, detail. If the parser found nothing useful we
  // fall back to the optional subtitle (category name).
  const pills: { key: string; content: React.ReactNode; muted?: boolean }[] = [];
  if (meta?.flag) {
    pills.push({
      key: "country",
      content: (
        <span className="flex items-center gap-1">
          <span aria-hidden>{meta.flag}</span>
          <span className="hidden sm:inline">{meta.country}</span>
        </span>
      ),
    });
  }
  if (meta?.network) {
    pills.push({
      key: "network",
      content: (
        <span className="font-semibold text-(--text)">{meta.network}</span>
      ),
    });
  }
  if (meta?.topic) {
    pills.push({
      key: "topic",
      content: (
        <span className="flex items-center gap-1">
          <span aria-hidden>{meta.topicEmoji}</span>
          {meta.topic}
        </span>
      ),
    });
  }
  if (meta?.detail) {
    pills.push({
      key: "detail",
      content: <span className="truncate">{meta.detail}</span>,
      muted: true,
    });
  }
  if (meta?.quality) {
    pills.push({
      key: "quality",
      content: (
        <span className="text-[9px] font-bold tracking-wider px-1.5 py-px rounded bg-white/5 border border-white/5 text-(--text-dim)">
          {meta.quality}
        </span>
      ),
    });
  }

  if (pills.length === 0) {
    return (
      <div className="mt-1.5 flex items-center gap-2 min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-(--text-muted) shrink-0">
          <span className="size-1.5 rounded-full bg-(--text-muted)" />
          On Air
        </span>
        <span className="text-[13px] text-(--text-dim) truncate min-w-0">
          {subtitle || "Live broadcast"}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5 min-w-0 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-(--text-muted) shrink-0">
        <span className="size-1.5 rounded-full bg-(--text-muted)" />
        On Air
      </span>
      {pills.map((p, idx) => (
        <span key={p.key} className="flex items-center gap-1.5 min-w-0">
          {idx > 0 && (
            <span className="text-(--text-muted)/50 select-none">·</span>
          )}
          <span
            className={cn(
              "text-[12px] truncate min-w-0",
              p.muted ? "text-(--text-muted)" : "text-(--text-dim)"
            )}
          >
            {p.content}
          </span>
        </span>
      ))}
    </div>
  );
}
