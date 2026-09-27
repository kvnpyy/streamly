import { describe, expect, it } from "vitest";
import {
  buildLiveCopyRemuxArgs,
  liveRemuxMediaBasename,
  rewriteLiveRemuxPlaylist,
} from "./live-copy-remux";

describe("live copy remux", () => {
  it("copy-remuxes into a 4s sliding window and does not transcode", () => {
    const args = buildLiveCopyRemuxArgs({
      inputUrl: "https://cdn.example/live.m3u8",
      outputDir: "/tmp/remux",
    });
    expect(args).toContain("-c");
    expect(args[args.indexOf("-c") + 1]).toBe("copy");
    expect(args).toContain("4");
    expect(args).not.toContain("libx264");
    expect(args).toContain("-hls_list_size");
  });

  it("accepts only generated segment basenames", () => {
    expect(liveRemuxMediaBasename("seg_00012.ts")).toBe("seg_00012.ts");
    expect(liveRemuxMediaBasename("../seg_00012.ts")).toBe("seg_00012.ts");
    expect(liveRemuxMediaBasename("index.m3u8")).toBeNull();
    expect(liveRemuxMediaBasename("seg_12.ts/../../etc/passwd")).toBeNull();
  });

  it("rewrites relative segments onto the remux proxy and leaves tags alone", () => {
    const playlist = [
      "#EXTM3U",
      "#EXT-X-TARGETDURATION:4",
      "#EXTINF:4.0,",
      "seg_00003.ts",
      "#EXTINF:4.0,",
      "https://cdn.example/other.ts",
    ].join("\n");
    const out = rewriteLiveRemuxPlaylist(
      playlist,
      "/api/stream?u=https%3A%2F%2Fcdn.example%2Flive.m3u8&type=hls&remux=copy"
    );
    expect(out).toContain(
      "/api/stream?u=https%3A%2F%2Fcdn.example%2Flive.m3u8&type=hls&remux=copy&media=seg_00003.ts"
    );
    expect(out).toContain("#EXT-X-TARGETDURATION:4");
    expect(out).toContain("https://cdn.example/other.ts");
  });
});
