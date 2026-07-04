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
  // Prefer stereo/main mixes; penalize missing channel metadata slightly.
  const channelPenalty = ch === 0 ? 2 : ch >= 2 ? 0 : 1;
  return codecRank * 10 + channelPenalty;
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
