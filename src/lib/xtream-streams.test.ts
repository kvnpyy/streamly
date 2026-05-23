import { describe, expect, it } from "vitest";
import { normalizeLiveStreamsPayload } from "./xtream";

describe("normalizeLiveStreamsPayload", () => {
  it("reads root arrays", () => {
    const rows = normalizeLiveStreamsPayload([
      {
        stream_id: 1,
        name: "Test",
        num: 10,
        stream_icon: "",
        added: "",
        tv_archive: 0,
        category_id: "55",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.stream_id).toBe(1);
    expect(rows[0]?.category_id).toBe("55");
  });

  it("unwraps common nested shapes", () => {
    expect(
      normalizeLiveStreamsPayload({
        streams: [
          {
            stream_id: "2",
            name: "Wrapped",
            num: 0,
            stream_icon: "",
            added: "",
            tv_archive: "0",
            category_id: 99,
          },
        ],
      })
    ).toHaveLength(1);

    expect(
      normalizeLiveStreamsPayload({
        data: [{ stream_id: 3, name: "DataKey", category_id: "x" }],
      })
    ).toHaveLength(1);
  });

  it("coerces string stream_id", () => {
    const r = normalizeLiveStreamsPayload([
      { stream_id: "404", name: "Chan", category_id: "1" },
    ]);
    expect(r[0]?.stream_id).toBe(404);
  });
});
