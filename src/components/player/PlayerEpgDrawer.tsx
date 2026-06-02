"use client";

import {
  PlayerScheduleVirtualList,
  type PlayerEpgScheduleRow,
} from "@/components/player/PlayerEpgSchedule";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export type PlayerEpgDrawerProps = {
  show: boolean;
  loading: boolean;
  rows: PlayerEpgScheduleRow[];
  clockMs: number;
  onClose: () => void;
};

/** Lazy-loaded live schedule drawer — keeps initial player chunk smaller. */
export function PlayerEpgDrawer({
  show,
  loading,
  rows,
  clockMs,
  onClose,
}: PlayerEpgDrawerProps) {
  if (!show) return null;

  return (
    <motion.div
      key="player-epg-drawer"
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ ease: [0.2, 0.8, 0.2, 1], duration: 0.25 }}
      className="absolute right-0 top-0 bottom-0 w-full sm:w-[360px] bg-black/92 border-l border-white/10 z-10 flex flex-col overflow-hidden min-h-0"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 z-[1] shrink-0 bg-black/85 px-4 py-3 flex items-center justify-between border-b border-white/10">
        <div className="text-white font-semibold text-sm">Schedule</div>
        <button
          type="button"
          onClick={onClose}
          className="size-8 grid place-items-center rounded-lg hover:bg-white/10 text-white/80"
          aria-label="Close schedule"
        >
          <X className="size-4" />
        </button>
      </div>
      {loading && (
        <div className="px-4 py-3 text-white/60 text-sm shrink-0">Loading…</div>
      )}
      {!loading && rows.length === 0 && (
        <div className="px-4 py-3 text-white/60 text-sm shrink-0">
          No EPG data for this channel.
        </div>
      )}
      {rows.length > 0 && (
        <PlayerScheduleVirtualList
          drawerOpen={show}
          rows={rows}
          clockMs={clockMs}
        />
      )}
    </motion.div>
  );
}
