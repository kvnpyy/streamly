import { describe, expect, it } from "vitest";
import { parseCatalogJson } from "./parse-catalog-json";

describe("parseCatalogJson", () => {
  it("parses small payloads on main thread", async () => {
    const payload = { categories: [], streams: [] };
    const text = JSON.stringify(payload);
    const out = (await parseCatalogJson(text)) as typeof payload;
    expect(out.streams).toEqual([]);
  });
});
