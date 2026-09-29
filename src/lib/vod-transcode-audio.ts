/** One audio stream from ffprobe — `index` is the ffmpeg input stream index. */
export type ProbedAudioStream = {
  index: number;
  codec: string | null;
  channels: number;
};

/** Lower score = better candidate for browser playback / transcode. */
export function scoreAudioStream(codec: string | null, channels: number): number {
  const c = (codec ?? "").toLowerCase();
  let codecRank = 2;
  if (!c) codecRank = 5;
  else if (c.includes("aac") || c === "mp3" || c.includes("mp4a")) codecRank = 0;
  else if (
    c.includes("ac3") ||
    c.includes("ac-3") ||
    c.includes("ec-3") ||
    c.includes("eac3")
  ) {
    codecRank = 1;
  } else if (c.includes("dts")) codecRank = 3;
  else if (c.includes("opus")) codecRank = 2;

  const ch = channels > 0 ? channels : 0;
  // IPTV files often list a stub AAC (no channel count, or a mono commentary)
  // ahead of the real AC-3 mix. Chrome plays the stub as silence. A real
  // surround track is re-encoded to AAC, which is what the browser can hear.
  if (ch === 0) return 100 + codecRank;
  if (ch < 2) return 40 + codecRank;
  return codecRank * 10;
}

/** Pick the ffmpeg stream index most likely to carry audible program audio. */
export function pickBestAudioStreamIndex(
  streams: ProbedAudioStream[]
): number | null {
  if (!streams.length) return null;

  let best = streams[0]!;
  let bestScore = scoreAudioStream(best.codec, best.channels);

  for (const stream of streams.slice(1)) {
    const score = scoreAudioStream(stream.codec, stream.channels);
    if (score < bestScore) {
      best = stream;
      bestScore = score;
    }
  }

  return best.index;
}
