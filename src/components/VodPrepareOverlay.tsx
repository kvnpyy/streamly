"use client";

import { useTvBrowser } from "@/components/TvBrowserProvider";
import { proxiedCssBackground } from "@/lib/image-proxy";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

const PHASES = [
  { at: 0, text: "Opening your episode" },
  { at: 4, text: "Connecting to your provider" },
  { at: 12, text: "Encoding the opening moments" },
  { at: 20, text: "Loading the first video chunk" },
  { at: 40, text: "Almost there…" },
] as const;

function phaseForElapsed(sec: number): string {
  let label: string = PHASES[0].text;
  for (const p of PHASES) {
    if (sec >= p.at) label = p.text;
  }
  return label;
}

export function VodPrepareOverlay({
  visible,
  title,
  subtitle,
  poster,
  startedAtMs,
  progress = 0,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  poster?: string;
  startedAtMs: number | null;
  /** 0–100 from real playback signals (not a timed fake bar). */
  progress?: number;
}) {
  const tvBrowser = useTvBrowser();
  const [phaseText, setPhaseText] = useState<string>(PHASES[0].text);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!visible || startedAtMs == null) return;
    const update = () => {
      setPhaseText(phaseForElapsed((Date.now() - startedAtMs) / 1000));
      setTick((n) => n + 1);
    };
    update();
    const id = window.setInterval(update, 1400);
    return () => window.clearInterval(id);
  }, [visible, startedAtMs]);

  const barPct = useMemo(() => {
    const p = Number.isFinite(progress) ? progress : 0;
    return Math.max(4, Math.min(96, p));
  }, [progress]);

  const posterBg = proxiedCssBackground(poster);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="vod-prepare"
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute inset-0 z-[7] overflow-hidden bg-[#06070b]"
          aria-live="polite"
          aria-busy="true"
        >
          {posterBg ? (
            <div
              className={cn(
                "absolute inset-0 bg-cover bg-center scale-105",
                !tvBrowser && "player-prep-poster-drift"
              )}
              style={{ backgroundImage: posterBg }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-(--bg-2) via-(--bg-0) to-black" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/35" />
          <div className="absolute inset-0 player-prep-vignette pointer-events-none" />

          <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 sm:pb-20 px-6 text-center">
            <div className="w-full max-w-md">
              <p className="text-[11px] uppercase tracking-[0.2em] text-(--brand-2)/90 mb-2 font-medium">
                Getting ready
              </p>
              <h2 className="text-lg sm:text-xl font-semibold text-white leading-snug line-clamp-2">
                {title}
              </h2>
              {subtitle ? (
                <p className="text-sm text-white/55 mt-1 line-clamp-2">{subtitle}</p>
              ) : null}

              <div className="mt-6 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-(--brand) via-(--brand-2) to-(--brand) transition-[width] duration-500 ease-out"
                  style={{ width: `${barPct}%` }}
                />
              </div>

              <AnimatePresence mode="wait">
                <motion.p
                  key={phaseText}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.28 }}
                  className="mt-4 text-sm text-white/75 min-h-[1.25rem]"
                >
                  {phaseText}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          <div
            className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 size-56 rounded-full bg-(--brand)/20 blur-3xl player-prep-glow"
            aria-hidden
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
