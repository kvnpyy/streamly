import { describe, expect, it } from "vitest";
import { rewriteHlsManifest } from "./hls-manifest-rewrite";

describe("rewriteHlsManifest", () => {
  const base = new URL("http://192.168.0.2:25461/live/user/pass/100.m3u8");

  it("rewrites segment lines and unquoted URI= tags", () => {
    const raw = [
      "#EXTM3U",
      '#EXT-X-STREAM-INF:BANDWIDTH=1000000,URI=http://192.168.0.2:25461/vod/variant.m3u8',
      "http://192.168.0.2:25461/seg/001.ts",
    ].join("\n");

    const out = rewriteHlsManifest(raw, base, { compatMse: false });
    expect(out).not.toContain("http://192.168.0.2");
    expect(out).toContain("/api/stream?u=");
    expect(out).toContain("variant.m3u8");
    expect(out).toContain("001.ts");
  });

  it("rewrites quoted EXT-X-KEY URIs", () => {
    const raw =
      '#EXT-X-KEY:METHOD=AES-128,URI="http://192.168.0.2/key.php"';
    const out = rewriteHlsManifest(raw, base, { compatMse: true });
    expect(out).toContain('URI="/api/stream?u=');
    expect(out).toContain("compat=mse");
    expect(out).not.toMatch(/URI="http:\/\//);
  });

  it("cast live manifests keep type=hls on segments (Smarters UA, not VLC)", () => {
    const raw = [
      "#EXTM3U",
      "#EXTINF:6,",
      "http://192.168.0.2:25461/live/user/pass/100.ts",
    ].join("\n");
    const out = rewriteHlsManifest(raw, base, {
      compatMse: false,
      forCast: true,
      proxyOrigin: "https://app.example",
    });
    expect(out).toContain("https://app.example/api/stream?u=");
    expect(out).toContain("type=hls");
    expect(out).toContain("cast=1");
    expect(out).not.toContain("type=vod");
  });
});
