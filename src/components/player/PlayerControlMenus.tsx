"use client";

import type { CastSenderUiState } from "@/hooks/player/use-player-cast";
import type { PlayerAudioTrack } from "@/lib/player-audio-tracks";
import {
  PLAYBACK_SPEED_OPTIONS,
  playbackSpeedLabel,
} from "@/lib/player-playback-speed";
import { cn } from "@/lib/utils";
import { isChromiumBasedDesktopBrowser } from "@/lib/browser";
import { hlsRenditionLabel } from "@/lib/live-hls-playback";
import { AnimatePresence, motion } from "framer-motion";
import type { Level } from "hls.js";
import {
  Cast,
  Captions,
  Check,
  Copy,
  ExternalLink,
  Settings2,
  Share2,
} from "lucide-react";

export type PlayerSubtitleTrack = {
  id: number;
  label: string;
  lang?: string;
  source: "hls" | "native";
};

export type PlayerControlMenusProps = {
  isLive: boolean;
  hasSubtitles: boolean;
  showSubs: boolean;
  setShowSubs: React.Dispatch<React.SetStateAction<boolean>>;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showShare: boolean;
  setShowShare: React.Dispatch<React.SetStateAction<boolean>>;
  subtitles: PlayerSubtitleTrack[];
  activeSubtitle: number;
  onSwitchSubtitle: (id: number) => void;
  audioTracks: PlayerAudioTrack[];
  activeAudioTrack: number;
  onSwitchAudioTrack: (id: number) => void;
  playbackSpeed: number;
  onSwitchPlaybackSpeed: (rate: number) => void;
  levels: Level[];
  currentLevel: number;
  qualityLabel: string;
  onSwitchLevel: (lvl: number) => void;
  castSenderState: CastSenderUiState;
  castMedia: { url: string; contentType: string } | null;
  onCast: () => void;
  castActionMessage: string | null;
  copied: boolean;
  onCopyDirectUrl: () => void;
  directUrl: string | null;
};

/** Subtitles, quality, and share/cast dropdowns — code-split from the main player chunk. */
export function PlayerControlMenus({
  isLive,
  hasSubtitles,
  showSubs,
  setShowSubs,
  showSettings,
  setShowSettings,
  showShare,
  setShowShare,
  subtitles,
  activeSubtitle,
  onSwitchSubtitle,
  audioTracks,
  activeAudioTrack,
  onSwitchAudioTrack,
  playbackSpeed,
  onSwitchPlaybackSpeed,
  levels,
  currentLevel,
  qualityLabel,
  onSwitchLevel,
  castSenderState,
  castMedia,
  onCast,
  castActionMessage,
  copied,
  onCopyDirectUrl,
  directUrl,
}: PlayerControlMenusProps) {
  const closeOtherPanels = (except: "subs" | "settings" | "share") => {
    if (except !== "subs") setShowSubs(false);
    if (except !== "settings") setShowSettings(false);
    if (except !== "share") setShowShare(false);
  };

  return (
    <>
      {hasSubtitles && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowSubs((s) => !s);
              closeOtherPanels("subs");
            }}
            aria-label="Subtitles"
            className={cn(
              "size-9 grid place-items-center rounded-lg hover:bg-white/10",
              showSubs && "bg-white/15",
              activeSubtitle !== -1 && "text-(--brand-2)"
            )}
          >
            <Captions className="size-4" />
          </button>
          <AnimatePresence>
            {showSubs && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute right-0 bottom-11 w-56 glass rounded-xl p-1.5 overflow-hidden max-h-72 overflow-y-auto"
              >
                <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/50">
                  Subtitles
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSwitchSubtitle(-1);
                    setShowSubs(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center justify-between",
                    activeSubtitle === -1 && "bg-white/10"
                  )}
                >
                  Off
                  {activeSubtitle === -1 && <Check className="size-3.5" />}
                </button>
                {subtitles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onSwitchSubtitle(s.id);
                      setShowSubs(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center justify-between",
                      activeSubtitle === s.id && "bg-white/10"
                    )}
                  >
                    <span className="truncate">
                      {s.label}
                      {s.lang && (
                        <span className="text-white/40 ml-1.5">{s.lang}</span>
                      )}
                    </span>
                    {activeSubtitle === s.id && (
                      <Check className="size-3.5 shrink-0" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowSettings((s) => !s);
            closeOtherPanels("settings");
          }}
          aria-label="Settings"
          className="h-9 px-2.5 grid grid-flow-col place-items-center gap-1.5 rounded-lg hover:bg-white/10 text-xs"
        >
          <Settings2 className="size-4" />
          <span className="hidden sm:inline">{qualityLabel}</span>
        </button>
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute right-0 bottom-11 w-56 glass rounded-xl p-1.5 overflow-hidden max-h-80 overflow-y-auto"
            >
              {!isLive && (
                <>
                  <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/50">
                    Playback speed
                  </div>
                  {PLAYBACK_SPEED_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => {
                        onSwitchPlaybackSpeed(rate);
                        setShowSettings(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center justify-between",
                        playbackSpeed === rate && "bg-white/10"
                      )}
                    >
                      {playbackSpeedLabel(rate)}
                      {playbackSpeed === rate && (
                        <Check className="size-3.5" />
                      )}
                    </button>
                  ))}
                </>
              )}
              {audioTracks.length > 1 && (
                <>
                  <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/50 border-t border-white/10 mt-1">
                    Audio
                  </div>
                  {audioTracks.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => {
                        onSwitchAudioTrack(track.id);
                        setShowSettings(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center justify-between",
                        activeAudioTrack === track.id && "bg-white/10"
                      )}
                    >
                      <span className="truncate">
                        {track.label}
                        {track.lang && (
                          <span className="text-white/40 ml-1.5">
                            {track.lang}
                          </span>
                        )}
                      </span>
                      {activeAudioTrack === track.id && (
                        <Check className="size-3.5 shrink-0" />
                      )}
                    </button>
                  ))}
                </>
              )}
              <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/50 border-t border-white/10 mt-1">
                Quality
              </div>
              {levels.length > 1 &&
                typeof navigator !== "undefined" &&
                isChromiumBasedDesktopBrowser() && (
                  <div className="px-3 pb-2 text-[11px] text-white/45 leading-snug">
                    Brave and Chrome default to the safest rung to reduce Dolby/HEVC
                    drop-outs. Pick Auto or higher for more bitrate (riskier on some
                    channels).
                  </div>
                )}
              <button
                type="button"
                onClick={() => {
                  onSwitchLevel(-1);
                  setShowSettings(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center justify-between",
                  currentLevel === -1 && "bg-white/10"
                )}
              >
                Auto
                {currentLevel === -1 && <Check className="size-3.5" />}
              </button>
              {levels.length === 0 && (
                <div className="px-3 py-2 text-xs text-white/40">
                  Single quality stream
                </div>
              )}
              {levels
                .map((l, i) => ({ l, i }))
                .sort((a, b) => (b.l.height || 0) - (a.l.height || 0))
                .map(({ l, i }) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onSwitchLevel(i);
                      setShowSettings(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center justify-between",
                      currentLevel === i && "bg-white/10"
                    )}
                  >
                    <span>
                      {(() => {
                        const primary = hlsRenditionLabel(l, i);
                        const fromBitrateOnly =
                          !l.height &&
                          !(l.name ?? "").trim() &&
                          Boolean(l.bitrate);
                        return (
                          <>
                            {primary}
                            {l.bitrate && !fromBitrateOnly ? (
                              <span className="text-white/40">
                                {" "}
                                · {Math.round(l.bitrate / 1000)}kbps
                              </span>
                            ) : null}
                          </>
                        );
                      })()}
                    </span>
                    {currentLevel === i && <Check className="size-3.5" />}
                  </button>
                ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowShare((s) => !s);
            closeOtherPanels("share");
          }}
          aria-label="Share"
          className={cn(
            "size-9 grid place-items-center rounded-lg hover:bg-white/10",
            showShare && "bg-white/15"
          )}
        >
          <Share2 className="size-4" />
        </button>
        <AnimatePresence>
          {showShare && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute right-0 bottom-11 w-72 glass rounded-xl p-1.5 overflow-hidden"
            >
              <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/50">
                Cast & open elsewhere
              </div>
              <div className="px-3 pb-1 text-[10px] text-white/45 leading-snug">
                Cast to TV uses{" "}
                <span className="text-white/60">Google Cast</span> (Chromecast,
                Google TV, Cast‑built‑in displays). Streams play through this
                app&apos;s server so your TV can reach them. MKV episodes use a
                short HLS prep on the TV. Roku, Samsung hubs, and AirPlay need
                the copied URL.
              </div>
              <button
                type="button"
                onClick={() => void onCast()}
                disabled={castSenderState !== "ready" || !castMedia}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-2">
                  <Cast className="size-4 shrink-0" />
                  <span>
                    {castSenderState === "ready" && "Cast to TV"}
                    {castSenderState === "loading" && "Cast to TV (loading…)"}
                    {castSenderState === "unsupported" &&
                      "Cast to TV (not in this browser)"}
                    {castSenderState === "failed" && "Cast to TV (unavailable)"}
                    {castSenderState === "inactive" && "Cast to TV"}
                  </span>
                </span>
                {castSenderState === "unsupported" && (
                  <span className="pl-6 text-[11px] text-white/50 leading-snug">
                    Use Chrome, Edge, or Brave on a computer or Android. On iPhone,
                    copy the URL below.
                  </span>
                )}
                {castSenderState === "failed" && (
                  <span className="pl-6 text-[11px] text-white/50 leading-snug">
                    Cast didn’t load (blocked network, extension, or ad blocker).
                    Refresh or copy the stream URL.
                  </span>
                )}
              </button>
              {castActionMessage && (
                <div className="mx-2 mb-1 rounded-lg border border-amber-400/25 bg-amber-950/40 px-2.5 py-2 text-[11px] text-amber-50/95 leading-snug">
                  {castActionMessage}
                </div>
              )}
              <button
                type="button"
                onClick={onCopyDirectUrl}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center gap-2"
              >
                {copied ? (
                  <Check className="size-4 text-(--brand-2)" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copied ? "Copied!" : "Copy stream URL"}
              </button>
              {directUrl && (
                <a
                  href={directUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowShare(false)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center gap-2"
                >
                  <ExternalLink className="size-4" />
                  Open in external player
                </a>
              )}
              <div className="px-3 pt-1 pb-2 text-[10px] text-white/40">
                Paste the URL into VLC, IINA, or Infuse to stream on any device.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
