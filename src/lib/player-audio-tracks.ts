export type PlayerAudioTrack = {
  id: number;
  label: string;
  lang?: string;
};

type HlsAudioTrackLike = {
  name?: string;
  lang?: string;
  audioCodec?: string;
};

export function audioCodecShortLabel(codec: string | undefined): string | undefined {
  const c = (codec ?? "").toLowerCase();
  if (!c) return undefined;
  if (c.includes("mp4a") || c.includes("aac")) return "AAC";
  if (c.includes("opus")) return "Opus";
  if (c.includes("ec-3") || c.includes("eac3")) return "E-AC-3";
  if (c.includes("ac-3") || c.includes("ac3")) return "AC-3";
  if (c.includes("dts")) return "DTS";
  return codec;
}

export function mapHlsAudioTracks(tracks: HlsAudioTrackLike[]): PlayerAudioTrack[] {
  return tracks.map((track, index) => {
    const codec = audioCodecShortLabel(track.audioCodec);
    const base =
      track.name?.trim() ||
      track.lang?.trim() ||
      (codec ? `Audio (${codec})` : `Audio ${index + 1}`);
    return {
      id: index,
      label: base,
      lang: track.lang || undefined,
    };
  });
}
