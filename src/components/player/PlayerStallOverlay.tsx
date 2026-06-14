"use client";

export type PlayerStallOverlayProps = {
  isLive: boolean;
  vodTranscodeBoost: boolean;
  extensionHint: string | null;
  copied: boolean;
  hasDirectUrl: boolean;
  onTryAgain: () => void;
  onCopyUrl: () => void;
  onClose: () => void;
};

export function PlayerStallOverlay({
  isLive,
  vodTranscodeBoost,
  extensionHint,
  copied,
  hasDirectUrl,
  onTryAgain,
  onCopyUrl,
  onClose,
}: PlayerStallOverlayProps) {
  return (
    <div className="absolute inset-x-0 bottom-24 mx-auto max-w-md px-4 z-[6]">
      <div className="glass rounded-xl px-4 py-3 text-center">
        <div className="text-white text-sm font-medium">
          {isLive ? "Having trouble starting this channel" : "Still preparing…"}
        </div>
        <div className="text-white/70 text-xs mt-1">
          {isLive ? (
            <>
              We&apos;re retrying the stream. The channel may be offline, or a
              wallet/privacy extension may be blocking playback in Chrome.
            </>
          ) : vodTranscodeBoost ? (
            <>
              Preparing a browser-friendly stream on the server. Focus an episode
              first next time — we start early while you browse.
            </>
          ) : (
            <>
              Movies and series can be slow to start on mobile, or the file may
              use codecs this browser can&apos;t play (MKV, HEVC, Dolby).
            </>
          )}
        </div>
        {extensionHint ? (
          <p className="text-white/55 text-[11px] mt-2 leading-snug">
            {extensionHint}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 justify-center">
          <button
            type="button"
            onClick={onTryAgain}
            className="px-4 py-2 rounded-lg btn-brand text-sm"
          >
            Try again
          </button>
          {hasDirectUrl ? (
            <button
              type="button"
              onClick={onCopyUrl}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
            >
              {copied ? "Copied" : "Copy stream URL"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
