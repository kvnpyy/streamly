import { describe, expect, it } from "vitest";
import {
  buildLiveChannelIndex,
  filterLiveChannelsByName,
} from "@/lib/live-channel-index";
import type { LiveStream } from "@/lib/xtream-types";

function ch(id: number, name: string): LiveStream {
  return {
    stream_id: id,
    name,
    category_id: "1",
    stream_icon: "",
  } as LiveStream;
}

describe("live-channel-index", () => {
  it("filters by precomputed lowercase names", () => {
    const index = buildLiveChannelIndex([
      ch(1, "CNN HD"),
      ch(2, "BBC One"),
    ]);
    const out = filterLiveChannelsByName(index, "cnn");
    expect(out.map((s) => s.stream_id)).toEqual([1]);
  });
});
