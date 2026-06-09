const IPTV_UA_VOD = "VLC/3.0.20 LibVLC/3.0.20";
const MKV_MAGIC = [0x1a, 0x45, 0xdf, 0xa3] as const;

function upstreamReferer(upstreamUrl: string): string {
  try {
    const u = new URL(upstreamUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return "";
  }
}

/** Reject empty/HTML provider responses before spawning ffmpeg (fails fast on 1-conn limits). */
export async function validateVodUpstreamReadable(
  upstream: string
): Promise<string | null> {
  const referer = upstreamReferer(upstream);
  const headers: Record<string, string> = {
    "user-agent": IPTV_UA_VOD,
    Range: "bytes=0-15",
  };
  if (referer) headers.Referer = referer;
  try {
    const res = await fetch(upstream, {
      headers,
      redirect: "follow",
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 410) {
      return "This episode isn't available from your provider.";
    }
    if (res.status === 403) {
      return "Your provider blocked this request.";
    }
    if (!res.ok) {
      return `Your provider returned HTTP ${res.status} for this file.`;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 4) {
      return "Your provider returned an empty response. If your IPTV plan allows only one stream, close other players and try again.";
    }
    const isMkv = MKV_MAGIC.every((b, i) => buf[i] === b);
    const isMp4 =
      buf.length >= 8 &&
      String.fromCharCode(buf[4], buf[5], buf[6], buf[7]) === "ftyp";
    if (!isMkv && !isMp4) {
      return "Your provider did not return a playable video file for this episode.";
    }
    return null;
  } catch {
    return "Could not reach your provider for this file. Check your connection and try again.";
  }
}
