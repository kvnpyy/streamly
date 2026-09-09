import { describe, expect, it } from "vitest";
import {
  collectXtreamSidecarSubtitles,
  episodeFromSeriesInfo,
} from "@/lib/xtream-subtitles";

describe("collectXtreamSidecarSubtitles", () => {
  it("reads movie_subtitles arrays and resolves relative URLs", () => {
    const tracks = collectXtreamSidecarSubtitles(
      {
        info: {
          movie_subtitles: [
            {
              language: "English",
              url: "/subtitle/user/pass/99.srt",
            },
            {
              lang: "es",
              file: "https://cdn.example/subs/es.vtt",
            },
          ],
        },
      },
      "http://panel.example:8080"
    );
    expect(tracks).toHaveLength(2);
    expect(tracks[0]?.label).toBe("English");
    expect(tracks[0]?.url).toBe(
      "http://panel.example:8080/subtitle/user/pass/99.srt"
    );
    expect(tracks[1]?.url).toBe("https://cdn.example/subs/es.vtt");
  });

  it("parses a JSON string of subtitle objects", () => {
    const tracks = collectXtreamSidecarSubtitles(
      {
        info: {
          subtitles: JSON.stringify([
            { name: "French", src: "https://cdn.example/fr.srt" },
          ]),
        },
      },
      "http://panel.example"
    );
    expect(tracks).toEqual([
      { label: "French", lang: undefined, url: "https://cdn.example/fr.srt" },
    ]);
  });

  it("ignores non-subtitle strings", () => {
    const tracks = collectXtreamSidecarSubtitles(
      { info: { subtitles: "English" } },
      "http://panel.example"
    );
    expect(tracks).toEqual([]);
  });
});

describe("episodeFromSeriesInfo", () => {
  it("finds an episode by id in a season map", () => {
    const payload = {
      episodes: {
        "1": [{ id: "10", title: "A" }, { id: "11", title: "B" }],
      },
    };
    expect(episodeFromSeriesInfo(payload, 11)).toMatchObject({ id: "11" });
    expect(episodeFromSeriesInfo(payload, 99)).toBeNull();
  });
});
