import { describe, expect, it } from "vitest";
import { orderLiveStreamsForFlip } from "./live-flip-playlist";
import type { LiveStream } from "./xtream-types";

function stub(id: number): LiveStream {
  return {
    num: id,
    name: `Ch ${id}`,
    stream_type: "live",
    stream_id: id,
    stream_icon: "",
    added: "",
    category_id: "1",
    tv_archive: 0,
  };
}

describe("orderLiveStreamsForFlip", () => {
  it("rotates so the playing channel is first", () => {
    const list = [stub(1), stub(2), stub(3)];
    expect(orderLiveStreamsForFlip(list, 2).map((s) => s.stream_id)).toEqual([
      2, 3, 1,
    ]);
  });
});
