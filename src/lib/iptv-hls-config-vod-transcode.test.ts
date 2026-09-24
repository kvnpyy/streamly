import { describe, expect, it } from "vitest";
import {
  buildVodTranscodeHlsJsConfig,
  disableVodTranscodeGapSeek,
} from "@/lib/iptv-hls-config";

describe("buildVodTranscodeHlsJsConfig", () => {
  it("buffers behind the encode edge and stretches short video across segment tails", () => {
    const cfg = buildVodTranscodeHlsJsConfig();
    expect(cfg.stretchShortVideoTrack).toBe(true);
    expect(cfg.maxLiveSyncPlaybackRate).toBe(1);
    expect(cfg.liveSyncDurationCount).toBeGreaterThanOrEqual(4);
    // Larger than one frame so tiny tails stretch, smaller than a segment so
    // hls.js does not seek a few seconds before every boundary.
    expect(cfg.maxBufferHole).toBeGreaterThan(0);
    expect(cfg.maxBufferHole).toBeLessThanOrEqual(0.1);
    expect(cfg.liveSyncMode).toBe("buffered");
    expect(cfg.maxBufferLength).toBeGreaterThanOrEqual(40);
    expect(cfg.startFragPrefetch).toBe(true);
    expect(cfg.initialLiveManifestSize).toBeGreaterThanOrEqual(3);
    expect(cfg.nudgeMaxRetry).toBeLessThanOrEqual(4);
    expect(cfg.nudgeOffset).toBeLessThanOrEqual(0.05);
    expect(cfg.nudgeOnVideoHole).toBe(false);
    expect(cfg.lowLatencyMode).toBe(false);
    expect(cfg.forceKeyFrameOnDiscontinuity).toBe(false);
    // hls.js throws if count- and duration-based live sync are mixed.
    expect(cfg.liveSyncDuration).toBeUndefined();
    expect(cfg.liveMaxLatencyDuration).toBeUndefined();
  });

  it("does not let the gap controller seek the playhead forward", () => {
    let skipped = 0;
    let nudged = 0;
    const hls = {
      gapController: {
        _trySkipBufferHole: () => {
          skipped += 1;
          return 5;
        },
        _tryNudgeBuffer: () => {
          nudged += 1;
          return 2;
        },
      },
    };
    disableVodTranscodeGapSeek(hls);
    expect(hls.gapController._trySkipBufferHole()).toBe(0);
    expect(hls.gapController._tryNudgeBuffer()).toBe(0);
    expect(skipped).toBe(0);
    expect(nudged).toBe(0);
  });

  it("disables max-latency live snap so scrub-back is not yanked to the tip", () => {
    const cfg = buildVodTranscodeHlsJsConfig();
    // Finite caps (historically 6 ≈ 24s) force synchronizeToLiveEdge to reset
    // currentTime toward the encode tip after every mid-film scrub.
    expect(cfg.liveMaxLatencyDurationCount).toBe(Infinity);
  });
});
