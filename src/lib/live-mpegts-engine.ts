import { applyElementMuted } from "@/lib/player-element-mute";
import {
  liveMpegtsFailureAction,
  type LiveMpegtsFailureAction,
} from "@/lib/live-web-ts";
import { playbackBreadcrumb } from "@/lib/playback-telemetry";
import { safeVideoPlay } from "@/lib/video-play";

/** Give the raw TS a chance to show a frame, then fall back to the playlist. */
const LIVE_MPEGTS_START_MS = 8_000;

type MpegtsModule = typeof import("mpegts.js").default;
type MpegtsPlayer = ReturnType<MpegtsModule["createPlayer"]>;

let modulePromise: Promise<MpegtsModule> | null = null;

function loadMpegtsModule(): Promise<MpegtsModule> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("mpegts is browser-only"));
  }
  if (!modulePromise) {
    modulePromise = import("mpegts.js").then((mod) => mod.default);
  }
  return modulePromise;
}

function destroyMpegtsPlayer(player: MpegtsPlayer | null): void {
  if (!player) return;
  try {
    player.pause();
  } catch {
    /* already torn down */
  }
  try {
    player.unload();
  } catch {
    /* noop */
  }
  try {
    player.detachMediaElement();
  } catch {
    /* noop */
  }
  try {
    player.destroy();
  } catch {
    /* noop */
  }
}

function createLivePlayer(
  mpegts: MpegtsModule,
  url: string,
  enableWorker: boolean
): MpegtsPlayer {
  return mpegts.createPlayer(
    {
      type: "mse",
      isLive: true,
      url,
      hasAudio: true,
      hasVideo: true,
    },
    {
      enableWorker,
      enableStashBuffer: false,
      stashInitialSize: 128,
      lazyLoad: false,
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 30,
      autoCleanupMinBackwardDuration: 12,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 1.5,
      liveBufferLatencyMinRemain: 0.3,
    }
  );
}

/**
 * Play a proxied Xtream `.ts?player=web` URL with mpegts.js.
 * `dispose` is safe to call before the player has attached.
 */
export function attachPhoneLiveMpegts(opts: {
  url: string;
  video: HTMLVideoElement;
  appleMobile: boolean;
  isCancelled: () => boolean;
  onAttached: () => void;
  onNeedsTap: () => void;
  onSettle: (action: LiveMpegtsFailureAction) => void;
}): { dispose: () => void } {
  let disposed = false;
  let player: MpegtsPlayer | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const settle = (action: LiveMpegtsFailureAction, detail: string) => {
    if (disposed || opts.isCancelled()) return;
    playbackBreadcrumb("live_mpegts_fallback", { detail, action });
    dispose();
    opts.onSettle(action);
  };

  const dispose = () => {
    disposed = true;
    if (timer != null) clearTimeout(timer);
    timer = null;
    const current = player;
    player = null;
    destroyMpegtsPlayer(current);
  };

  void (async () => {
    let mpegts: MpegtsModule;
    try {
      mpegts = await loadMpegtsModule();
    } catch {
      settle("hls", "module_load_failed");
      return;
    }
    if (disposed || opts.isCancelled()) return;

    try {
      mpegts.LoggingControl.applyConfig({
        enableAll: false,
        enableDebug: false,
        enableVerbose: false,
        enableInfo: false,
        enableWarn: false,
        enableError: true,
      });
    } catch {
      /* logging is optional */
    }

    let mseLive = false;
    try {
      mseLive =
        mpegts.isSupported() && mpegts.getFeatureList().mseLivePlayback;
    } catch {
      mseLive = false;
    }
    if (!mseLive) {
      settle("hls", "mse_unsupported");
      return;
    }

    try {
      try {
        player = createLivePlayer(mpegts, opts.url, true);
      } catch {
        player = createLivePlayer(mpegts, opts.url, false);
      }
    } catch {
      settle("hls", "create_failed");
      return;
    }
    if (disposed || opts.isCancelled()) {
      destroyMpegtsPlayer(player);
      player = null;
      return;
    }

    playbackBreadcrumb("live_mpegts_start", {});
    const active = player;
    opts.onAttached();
    active.on(mpegts.Events.ERROR, (_type: string, detail: unknown) => {
      const detailStr = typeof detail === "string" ? detail : "";
      settle(
        liveMpegtsFailureAction(detailStr, opts.appleMobile),
        detailStr || "error"
      );
    });
    active.on(mpegts.Events.MEDIA_INFO, () => {
      if (timer != null) clearTimeout(timer);
      timer = null;
    });

    timer = setTimeout(() => {
      timer = null;
      const started =
        opts.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ||
        opts.video.currentTime > 0.2;
      if (started) return;
      settle("hls", "startup_timeout");
    }, LIVE_MPEGTS_START_MS);

    try {
      active.attachMediaElement(opts.video);
      active.load();
      await Promise.resolve(active.play());
    } catch {
      if (disposed || opts.isCancelled()) return;
      try {
        applyElementMuted(opts.video, true);
        await safeVideoPlay(opts.video);
        opts.onNeedsTap();
      } catch {
        if (!disposed && !opts.isCancelled()) opts.onNeedsTap();
      }
    }
  })();

  return { dispose };
}
