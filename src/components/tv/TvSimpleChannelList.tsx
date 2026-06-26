"use client";

import { buildImageProxy } from "@/lib/image-proxy";
import { cn } from "@/lib/utils";

export type TvSimpleChannelRow = {
  id: number;
  name: string;
  icon?: string | null;
  panelServer: string;
};

type TvSimpleChannelListProps = {
  channels: TvSimpleChannelRow[];
  onSelect: (id: number) => void;
  className?: string;
};

function ChannelLogo({
  name,
  icon,
  panelServer,
}: {
  name: string;
  icon?: string | null;
  panelServer: string;
}) {
  const src = buildImageProxy(icon, panelServer);
  if (!src) {
    return (
      <span className="tv-simple-channel-list__logo-fallback" aria-hidden>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="size-12 rounded-lg object-cover bg-(--bg-3)" />
  );
}

/** Compact vertical channel list — easier to scan than a dense card grid on TV. */
export function TvSimpleChannelList({
  channels,
  onSelect,
  className,
}: TvSimpleChannelListProps) {
  return (
    <div className={cn("tv-simple-channel-list", className)}>
      {channels.map((ch) => (
        <button
          key={ch.id}
          type="button"
          data-tv-card-root
          className="tv-simple-channel-list__row focus-ring"
          onClick={() => onSelect(ch.id)}
        >
          <span className="tv-simple-channel-list__logo">
            <ChannelLogo
              name={ch.name}
              icon={ch.icon}
              panelServer={ch.panelServer}
            />
          </span>
          <span className="tv-simple-channel-list__name">{ch.name}</span>
        </button>
      ))}
    </div>
  );
}
