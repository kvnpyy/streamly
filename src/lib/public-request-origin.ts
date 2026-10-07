const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

function hostnameOf(host: string): string {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return host.split(":")[0]?.toLowerCase() ?? host;
  }
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(hostnameOf(host));
}

/**
 * Origin a TV or Chromecast can actually reach.
 *
 * `next start -H 127.0.0.1` plus `x-forwarded-proto: https` makes `req.url`
 * `https://localhost:3000`. Cast playlists used that as the segment prefix,
 * so VLC and TV apps requested the stream from the television and showed
 * "file not found".
 */
export function publicRequestOrigin(req: {
  url: string;
  headers: { get(name: string): string | null };
}): string {
  const forwardedHost = firstHeaderValue(req.headers.get("x-forwarded-host"));
  const host = firstHeaderValue(req.headers.get("host"));
  const protoRaw = firstHeaderValue(req.headers.get("x-forwarded-proto"));
  const proto = protoRaw === "http" ? "http" : "https";
  const publicHost = [forwardedHost, host].find(
    (candidate) => candidate && !isLoopbackHost(candidate)
  );

  if (publicHost) return `${proto}://${publicHost}`;

  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}
