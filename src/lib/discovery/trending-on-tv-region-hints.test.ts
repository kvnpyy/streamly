import { describe, expect, it } from "vitest";
import { filterStreamsForTvRegion } from "@/lib/live-category-shelf";
import type { LiveStream } from "@/lib/xtream-types";

function ch(id: number, name: string, categoryId = "1"): LiveStream {
  return {
    num: id,
    stream_id: id,
    name,
    stream_type: "live",
    stream_icon: "",
    epg_channel_id: "",
    added: "",
    category_id: categoryId,
    custom_sid: "",
    tv_archive: 0,
    direct_source: "",
    tv_archive_duration: 0,
  };
}

describe("trending on TV hint region filtering", () => {
  it("keeps North America channels and drops UK hints", () => {
    const uk = ch(1, "[UK] BBC PARLIAMENT");
    const ca = ch(2, "[CA] A&E HD");
    expect(
      filterStreamsForTvRegion([uk], "North America", "[UK] NEWS").length
    ).toBe(0);
    expect(
      filterStreamsForTvRegion([ca], "North America", "[CA] CANADA").length
    ).toBe(1);
  });
});
