# VOD scrubbing, phase 2: full-length playlist with on-demand encoding

Status: **tabled** (2026-10-08). Phase 1 shipped in 0.13.93 through 0.13.96.

## Why

The player gets a growing playlist (no `#EXT-X-ENDLIST`), so hls.js treats every
transcoded episode like a live stream. Anything past the encoded tip does not
exist yet, so a far scrub means:

1. `restartTranscodeAtSeek` in `src/components/Player.tsx` builds a `tc_seek` URL.
2. The server starts a **second** ffmpeg job at the seek point, rounded down to
   the minute (`quantizeTranscodeSeekSec`).
3. The client polls for that playlist for up to 180s, then destroys hls.js and
   reloads the whole player (`setVodPlaybackOverride`).

What we saw in production on 2026-10-08:

- Seek requests waited about 20s, then returned 503 "Server is busy preparing
  other videos".
- Seek jobs evicted each other (`evicted-for=` ping-pong) on a 4-core VPS that
  allows 2–3 concurrent encodes.
- Some seek encodes failed outright ("Nothing was written into output file").
- The server's load average was around 16 on 4 cores while 3 encodes ran.

## Target behaviour

- The player gets a **complete VOD playlist up front**: every segment of the
  episode listed with `#EXT-X-PLAYLIST-TYPE:VOD` and `#EXT-X-ENDLIST`.
- Seeking anywhere is a native hls.js seek: no reload, no `tc_seek`, and no
  live-edge behaviour.
- **One encoder per episode.** When the player asks for a segment that is not
  encoded yet, the server moves that episode's encoder to the segment and
  encodes forward from there.
- Encoded segments are kept, so scrubbing back never re-encodes.

## Design

### Fixed segment grid

- Segment `n` covers `[n*S, (n+1)*S)` source seconds, with `S = 4`. The playlist
  can be generated from the episode duration alone (`durationSec` in
  `.meta.json`), so it exists before any encoding.
- Each segment must start on a keyframe at exactly `n*S`. Use
  `-force_key_frames "expr:gte(t,n_forced*4)"` plus `-hls_time 4`, with
  `-sc_threshold 0` and a closed GOP. Today's segments are 2–5s because the
  keyframes are not forced.
- The last segment is shorter: `duration - floor(duration/S)*S`.

### Encoder that jumps

- A job is started at segment `k` with `-ss k*S` (input seek on the local
  source), `-start_number k`, and `-output_ts_offset k*S`, so every segment's
  timestamps are already on the episode clock. That removes the
  `alignFmp4ThroughIndex` rewrite pass, which re-reads every earlier segment's
  head after a restart. That rewrite cost 613ms on one segment request in
  production.
- When segment `n` is requested and missing:
  - If the encoder's next output is within about 3 segments of `n`, wait for it.
  - Otherwise stop the encoder and restart it at `n`, unless segment `n` is
    already on disk.
  - When the encoder reaches a segment that already exists, stop it, or skip
    forward to the next hole.
- Serve with a long-poll wait of about 10s per segment, then 503 with
  `retry-after`. hls.js retries with its own fragment load policy.
- Keep follow mode (`src/lib/vod-source-follow.ts`) for from-0 playback while
  the source is still downloading.

### Playlist

- Generated, not ffmpeg's `index.m3u8`. ffmpeg's playlist is no longer the
  source of truth; it only marks which segments exist on disk.
- `#EXT-X-MAP` points at one `init.mp4` per episode. Every restart must produce
  an identical init: same encoder settings, same track order, same timescale.
  Verify this byte for byte and fail loudly if it differs.
- `#EXTINF` for every segment is `S`, except the last.

### Source download limits

- A segment past the downloaded part of the source cannot be encoded until the
  download gets there. Single-connection IPTV plans cannot open a second
  download.
- For those segments, return 503 with `x-vod-source-pct`, and show the existing
  "Seeking to MM:SS — encoding from your provider" banner in the player.
- Providers that allow a second connection with Range requests could fetch from
  the seek point, but that is out of scope for phase 2.

### Client changes

- Remove the `tc_seek` fork path: `transcodeSeekNeedsServerRestart`,
  `restartTranscodeAtSeek`, `vodTimelineHoldRef`, and the
  `x-vod-start-offset-sec` timeline offset logic. Every episode is offset 0.
- Keep the land verification in `player-vod-seek-land.ts`, but a far scrub now
  waits on segment fetches, not a reload.
- The seek bar can show which parts are encoded (from a header such as
  `x-vod-encoded-ranges`) so a buffering scrub is expected.
- Keep scrub previews from the local source (shipped in 0.13.96). Add a
  thumbnail sprite sheet built once the download finishes, so drag previews are
  instant.

### What goes away

- Seek jobs, `cancelSiblingTranscodeJobs`, `findReusableTranscodeJob`, and
  `quantizeTranscodeSeekSec`. The 60s rounding meant a seek job could start up
  to 59s before the scrub target.
- `append_list` resume, `resumeSeekSecForDiskPrefix`, the timeline alignment
  state, silent-tail drops, and contiguity heals. Most of the restart-seam bugs
  fixed today live in this code.
- Live-edge hls.js tuning in `buildVodTranscodeHlsJsConfig`.

## Risks and open questions

- Forced keyframes every 4s slightly raise bitrate at `ultrafast`. Measure the
  size and quality cost.
- Audio: AAC frames (about 21.3ms) do not divide 4s evenly. Each restart must
  start audio at the same point, or there is a tiny gap or overlap at the seam.
  Test with `-ss` accuracy on MKV and TS sources, and with HEVC and H.264.
- Some sources have a non-zero start time or B-frame delay, so `-ss k*S` must
  land on the episode clock, not the file clock.
- Existing caches: bump `CACHE_KEY_SUFFIX` in `src/lib/vod-transcode-paths.ts`
  so old growing-playlist encodes are not mixed with grid encodes.
- Chromecast and the TV/MPEG-TS path (`pack: "ts"`) need the same grid.
- CPU: one encoder per watched episode still competes on a 4-core VPS. Keep
  encoders under `nice` (0.13.96) and keep `STREAM_TRANSCODE_MAX_JOBS` at 2–3.

## Rollout

1. Build behind a flag (`STREAM_TRANSCODE_GRID=1`), server and client.
2. Test on one episode: play from 0, scrub forward past the tip, scrub back,
   spam ±10s, let it finish, reopen after a restart. Check segment timestamps
   with `/tmp/fmp4gaps.py` on the VPS. Expect no gaps over 0.05s at seams.
3. Turn it on for everyone, then delete the fork and resume code paths.

## Phase 1 (done, for reference)

- 0.13.93: an encode started mid-episode now counts as finished at the credits.
  This stopped an endless restart loop at the last second.
- 0.13.94: per-request server log (`[vod-req]`).
- 0.13.95: the playlist check no longer kills a live encode on a race between
  reading the playlist and listing the disk.
- 0.13.96: ffmpeg runs under `nice 10`. Rapid skips settle for 450ms before a
  server seek. Scrub previews come from the downloaded source file. The disk
  sweeper logs what it deletes.
