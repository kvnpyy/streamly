import { describe, expect, it } from "vitest";
import { pickLiveDiscoveryCandidateIds } from "@/lib/discovery/live-candidates";
import type { LiveStream } from "@/lib/xtream-types";

describe("pickLiveDiscoveryCandidateIds", () => {
  const channels: LiveStream[] = [
    { stream_id: 1, name: "A", stream_icon: "" },
    { stream_id: 2, name: "B", stream_icon: "" },
    { stream_id: 3, name: "C", stream_icon: "" },
  ];

  it("prepends priority stream ids", () => {
    const ids = pickLiveDiscoveryCandidateIds(channels, [], [], 10, [3, 99]);
    expect(ids[0]).toBe(3);
    expect(ids).toContain(1);
    expect(ids).not.toContain(99);
  });
});
