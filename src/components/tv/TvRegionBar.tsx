"use client";

import { ALL_TV_REGIONS, type TvRegion } from "@/lib/geo-continent";
import { cn } from "@/lib/utils";

type TvRegionBarProps = {
  region: TvRegion;
  onChange: (region: TvRegion) => void;
  className?: string;
};

/** Large region chips for TV remotes — replaces desktop dropdown. */
export function TvRegionBar({ region, onChange, className }: TvRegionBarProps) {
  return (
    <div className={cn("tv-region-bar", className)}>
      <span className="tv-region-bar__label">Region</span>
      <div className="tv-region-bar__chips" role="listbox" aria-label="TV region">
        {ALL_TV_REGIONS.map((r) => {
          const selected = region === r;
          return (
            <button
              key={r}
              type="button"
              role="option"
              aria-selected={selected}
              data-tv-card-root
              className={cn(
                "tv-region-bar__chip focus-ring",
                selected && "tv-region-bar__chip--active"
              )}
              onClick={() => onChange(r)}
            >
              {r === "All" ? "All" : r}
            </button>
          );
        })}
      </div>
    </div>
  );
}
