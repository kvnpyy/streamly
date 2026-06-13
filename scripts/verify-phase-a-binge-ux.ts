/**
 * Phase A binge UX verification — run with: npx tsx scripts/verify-phase-a-binge-ux.ts
 */
import { mapHlsAudioTracks } from "../src/lib/player-audio-tracks";
import {
  AUTOPLAY_COUNTDOWN_SEC,
  shouldAutoplayOnEnded,
  shouldOfferAutoplayNext,
  tickAutoplayCountdown,
} from "../src/lib/player-autoplay-next";
import {
  normalizePlaybackSpeed,
  playbackSpeedLabel,
  PLAYBACK_SPEED_OPTIONS,
} from "../src/lib/player-playback-speed";
import { usePlayer, type PlayerPlaylist, type PlayerSource } from "../src/store/player";

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

const ep1: PlayerSource = {
  kind: "series",
  id: 99,
  streamId: 1001,
  title: "Demo Show",
  subtitle: "S1 · E1",
  url: "http://demo/ep1.mkv",
};
const ep2: PlayerSource = {
  kind: "series",
  id: 99,
  streamId: 1002,
  title: "Demo Show",
  subtitle: "S1 · E2",
  url: "http://demo/ep2.mkv",
};
const playlist: PlayerPlaylist = { kind: "series", items: [ep1, ep2] };

// 1. Autoplay gate
check(
  "autoplay offers in last 15s with next episode",
  shouldOfferAutoplayNext({
    open: true,
    kind: "series",
    playlist,
    index: 0,
    durationSec: 3600,
    currentTimeSec: 3590,
    dismissedForEpisode: false,
    watchCreditsForEpisode: false,
    hasNextEpisode: true,
  })
);

check(
  "autoplay blocked after cancel",
  !shouldOfferAutoplayNext({
    open: true,
    kind: "series",
    playlist,
    index: 0,
    durationSec: 3600,
    currentTimeSec: 3590,
    dismissedForEpisode: true,
    watchCreditsForEpisode: false,
    hasNextEpisode: true,
  })
);

check(
  "autoplay blocked after watch credits",
  !shouldOfferAutoplayNext({
    open: true,
    kind: "series",
    playlist,
    index: 0,
    durationSec: 3600,
    currentTimeSec: 3590,
    dismissedForEpisode: false,
    watchCreditsForEpisode: true,
    hasNextEpisode: true,
  })
);

check(
  "no autoplay on final episode",
  !shouldOfferAutoplayNext({
    open: true,
    kind: "series",
    playlist,
    index: 1,
    durationSec: 3600,
    currentTimeSec: 3590,
    dismissedForEpisode: false,
    watchCreditsForEpisode: false,
    hasNextEpisode: false,
  })
);

// 2. Countdown completes in 5 ticks
let countdown: number | null = AUTOPLAY_COUNTDOWN_SEC;
let advances = 0;
while (countdown != null) {
  const tick = tickAutoplayCountdown(countdown);
  if (tick.shouldAdvance) advances += 1;
  countdown = tick.next;
}
check("countdown advances exactly once after 5 ticks", advances === 1);

// 3. Player store flip (autoplay path)
usePlayer.setState({ current: null, open: false, playlist: null, index: -1 });
usePlayer.getState().play(ep1, { playlist });
usePlayer.getState().flip(1, { immediate: true });
check(
  "player flip advances to next series episode",
  usePlayer.getState().current?.streamId === 1002
);

// 4. Ended fallback
check(
  "ended event may advance when not cancelled",
  shouldAutoplayOnEnded({
    kind: "series",
    playlist,
    index: 0,
    dismissedForEpisode: false,
    watchCreditsForEpisode: false,
    hasNextEpisode: true,
  })
);

// 5. Playback speed
check(
  "playback speed normalizes to supported values",
  normalizePlaybackSpeed(1.3) === 1.25 &&
    playbackSpeedLabel(1) === "Normal" &&
    PLAYBACK_SPEED_OPTIONS.includes(1.5)
);

// 6. Audio tracks
const mapped = mapHlsAudioTracks([
  { name: "English", lang: "en", audioCodec: "mp4a.40.2" },
  { name: "Spanish", lang: "es", audioCodec: "ac-3" },
]);
check(
  "audio track mapper produces selectable rows",
  mapped.length === 2 && mapped[0]?.label === "English"
);

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  const mark = c.ok ? "✓" : "✗";
  console.log(`${mark} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} Phase A verification checks passed.`);
