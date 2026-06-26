import type {
  AuthResponse,
  Category,
  LiveStream,
  SeriesItem,
  VodStream,
} from "@/lib/xtream-types";
import {
  REVIEW_SAMPLE_LIVE_HLS,
  REVIEW_SAMPLE_VOD_MP4,
} from "@/lib/review-panel/sample-streams";

const NOW = Math.floor(Date.now() / 1000);

export const REVIEW_LIVE_CATEGORIES: Category[] = [
  { category_id: "1", category_name: "News", parent_id: 0 },
  { category_id: "2", category_name: "Sports", parent_id: 0 },
  { category_id: "3", category_name: "Entertainment", parent_id: 0 },
];

export const REVIEW_VOD_CATEGORIES: Category[] = [
  { category_id: "10", category_name: "Adventure", parent_id: 0 },
  { category_id: "11", category_name: "Documentary", parent_id: 0 },
  { category_id: "12", category_name: "Family", parent_id: 0 },
];

export const REVIEW_SERIES_CATEGORIES: Category[] = [
  { category_id: "20", category_name: "Drama", parent_id: 0 },
  { category_id: "21", category_name: "Sci-Fi", parent_id: 0 },
];

export const REVIEW_LIVE_STREAMS: LiveStream[] = [
  {
    num: 1,
    name: "News 24",
    stream_type: "live",
    stream_id: 101,
    stream_icon: "",
    epg_channel_id: "review-news-24",
    added: String(NOW),
    category_id: "1",
    tv_archive: 0,
    direct_source: REVIEW_SAMPLE_LIVE_HLS[0],
  },
  {
    num: 2,
    name: "World View",
    stream_type: "live",
    stream_id: 102,
    stream_icon: "",
    epg_channel_id: "review-world-view",
    added: String(NOW),
    category_id: "1",
    tv_archive: 0,
    direct_source: REVIEW_SAMPLE_LIVE_HLS[1],
  },
  {
    num: 3,
    name: "Sports One",
    stream_type: "live",
    stream_id: 201,
    stream_icon: "",
    epg_channel_id: "review-sports-one",
    added: String(NOW),
    category_id: "2",
    tv_archive: 0,
    direct_source: REVIEW_SAMPLE_LIVE_HLS[2],
  },
  {
    num: 4,
    name: "Arena HD",
    stream_type: "live",
    stream_id: 202,
    stream_icon: "",
    epg_channel_id: "review-arena-hd",
    added: String(NOW),
    category_id: "2",
    tv_archive: 0,
    direct_source: REVIEW_SAMPLE_LIVE_HLS[3],
  },
  {
    num: 5,
    name: "Family TV",
    stream_type: "live",
    stream_id: 301,
    stream_icon: "",
    epg_channel_id: "review-family-tv",
    added: String(NOW),
    category_id: "3",
    tv_archive: 0,
    direct_source: REVIEW_SAMPLE_LIVE_HLS[0],
  },
  {
    num: 6,
    name: "Cinema Plus",
    stream_type: "live",
    stream_id: 302,
    stream_icon: "",
    epg_channel_id: "review-cinema-plus",
    added: String(NOW),
    category_id: "3",
    tv_archive: 0,
    direct_source: REVIEW_SAMPLE_LIVE_HLS[1],
  },
];

export const REVIEW_VOD_STREAMS: VodStream[] = [
  {
    num: 1,
    name: "Sample Adventure",
    title: "Sample Adventure",
    year: "2024",
    stream_type: "movie",
    stream_id: 1001,
    stream_icon: "",
    rating: "7.4",
    added: String(NOW),
    category_id: "10",
    container_extension: "mp4",
    direct_source: REVIEW_SAMPLE_VOD_MP4[0],
  },
  {
    num: 2,
    name: "Ocean Journey",
    title: "Ocean Journey",
    year: "2023",
    stream_type: "movie",
    stream_id: 1002,
    stream_icon: "",
    rating: "8.1",
    added: String(NOW),
    category_id: "11",
    container_extension: "mp4",
    direct_source: REVIEW_SAMPLE_VOD_MP4[1],
  },
  {
    num: 3,
    name: "Mountain Quest",
    title: "Mountain Quest",
    year: "2024",
    stream_type: "movie",
    stream_id: 1003,
    stream_icon: "",
    rating: "7.8",
    added: String(NOW),
    category_id: "10",
    container_extension: "mp4",
    direct_source: REVIEW_SAMPLE_VOD_MP4[2],
  },
  {
    num: 4,
    name: "Golden Hour",
    title: "Golden Hour",
    year: "2023",
    stream_type: "movie",
    stream_id: 1004,
    stream_icon: "",
    rating: "7.9",
    added: String(NOW),
    category_id: "12",
    container_extension: "mp4",
    direct_source: REVIEW_SAMPLE_VOD_MP4[3],
  },
];

export const REVIEW_SERIES: SeriesItem[] = [
  {
    num: 1,
    name: "Coastal Tales",
    title: "Coastal Tales",
    year: "2024",
    series_id: 2001,
    cover: "",
    plot: "Placeholder series for Samsung QA — sample episodes only.",
    genre: "Drama",
    rating: "8.0",
    category_id: "20",
  },
  {
    num: 2,
    name: "Signal Lost",
    title: "Signal Lost",
    year: "2024",
    series_id: 2002,
    cover: "",
    plot: "Sci-fi anthology with short demo episodes.",
    genre: "Sci-Fi",
    rating: "8.2",
    category_id: "21",
  },
];

export function buildReviewAuthResponse(
  username: string,
  password: string,
  server: string
): AuthResponse {
  const base = server.replace(/\/+$/, "");
  let host = "iptvwebplayer.org";
  let protocol: "http" | "https" = "https";
  try {
    const u = new URL(base);
    host = u.hostname;
    protocol = u.protocol === "http:" ? "http" : "https";
  } catch {
    /* defaults */
  }

  return {
    user_info: {
      username,
      password,
      auth: 1,
      status: "Active",
      message: "Streamly review account — sample content only.",
      exp_date: String(NOW + 365 * 24 * 3600),
      is_trial: "0",
      active_cons: "0",
      max_connections: "10",
      allowed_output_formats: ["m3u8", "ts", "mp4"],
    },
    server_info: {
      url: host,
      port: protocol === "https" ? "443" : "80",
      https_port: "443",
      server_protocol: protocol,
      timezone: "America/Toronto",
      timestamp_now: NOW,
      time_now: new Date(NOW * 1000).toISOString(),
    },
  };
}

export function reviewSeriesInfo(seriesId: number) {
  const series = REVIEW_SERIES.find((s) => s.series_id === seriesId);
  if (!series) return null;

  const episodes =
    seriesId === 2001
      ? {
          "1": [
            {
              id: "3001",
              episode_num: 1,
              title: "Harbor Lights",
              container_extension: "mp4",
              info: {
                plot: "Opening episode — sample VOD for QA.",
                duration_secs: 634,
                duration: "00:10:34",
              },
              direct_source: REVIEW_SAMPLE_VOD_MP4[0],
            },
            {
              id: "3002",
              episode_num: 2,
              title: "Tide Turn",
              container_extension: "mp4",
              info: {
                plot: "Second episode — sample VOD for QA.",
                duration_secs: 598,
                duration: "00:09:58",
              },
              direct_source: REVIEW_SAMPLE_VOD_MP4[1],
            },
          ],
        }
      : {
          "1": [
            {
              id: "3011",
              episode_num: 1,
              title: "Static",
              container_extension: "mp4",
              info: {
                plot: "Pilot episode — sample VOD for QA.",
                duration_secs: 720,
                duration: "00:12:00",
              },
              direct_source: REVIEW_SAMPLE_VOD_MP4[2],
            },
          ],
        };

  return {
    seasons: [{ season_number: 1, name: "Season 1", episode_count: Object.values(episodes)[0]?.length ?? 0 }],
    info: {
      name: series.name,
      cover: series.cover,
      plot: series.plot,
      genre: series.genre,
      rating: series.rating,
      releaseDate: series.year,
    },
    episodes,
  };
}

export function reviewVodInfo(streamId: number) {
  const movie = REVIEW_VOD_STREAMS.find((m) => m.stream_id === streamId);
  if (!movie) return null;

  return {
    info: {
      name: movie.name,
      plot:
        "Placeholder movie for Samsung / store QA. Playback uses a public sample MP4 — not a licensed broadcast.",
      genre: movie.category_id === "11" ? "Documentary" : "Adventure",
      rating: movie.rating,
      releasedate: movie.year,
      duration_secs: 596,
      duration: "00:09:56",
      container_extension: movie.container_extension ?? "mp4",
    },
    movie_data: {
      stream_id: movie.stream_id,
      name: movie.name,
      title: movie.title,
      year: movie.year,
      category_id: movie.category_id,
      container_extension: movie.container_extension ?? "mp4",
      direct_source: movie.direct_source,
    },
  };
}

export function reviewShortEpg(streamId: number) {
  const ch = REVIEW_LIVE_STREAMS.find((s) => s.stream_id === streamId);
  if (!ch) return { epg_listings: [] };

  const start = NOW - 900;
  const end = NOW + 2700;
  return {
    epg_listings: [
      {
        id: `${streamId}-now`,
        epg_id: ch.epg_channel_id ?? String(streamId),
        title: `${ch.name} — Sample programme`,
        lang: "en",
        start: String(start),
        end: String(end),
        description:
          "Placeholder EPG entry for store certification. Live playback uses a public HLS test stream.",
        channel_id: ch.epg_channel_id ?? String(streamId),
        start_timestamp: start,
        stop_timestamp: end,
      },
    ],
  };
}

function filterByCategory<T extends { category_id: string }>(
  rows: T[],
  categoryId?: string
): T[] {
  if (!categoryId) return rows;
  return rows.filter((r) => r.category_id === categoryId);
}

export function reviewPanelAction(
  action: string | null,
  params: Record<string, string>,
  creds: { server: string; username: string; password: string }
): unknown {
  switch (action) {
    case null:
    case "":
    case undefined:
      return buildReviewAuthResponse(
        creds.username,
        creds.password,
        creds.server
      );
    case "get_live_categories":
      return REVIEW_LIVE_CATEGORIES;
    case "get_vod_categories":
      return REVIEW_VOD_CATEGORIES;
    case "get_series_categories":
      return REVIEW_SERIES_CATEGORIES;
    case "get_live_streams":
      return filterByCategory(REVIEW_LIVE_STREAMS, params.category_id);
    case "get_vod_streams":
      return filterByCategory(REVIEW_VOD_STREAMS, params.category_id);
    case "get_series":
      return filterByCategory(REVIEW_SERIES, params.category_id);
    case "get_vod_info": {
      const id = Number(params.vod_id ?? params.stream_id);
      return reviewVodInfo(id) ?? { info: {}, movie_data: {} };
    }
    case "get_series_info": {
      const id = Number(params.series_id);
      return reviewSeriesInfo(id) ?? { seasons: [], info: { name: "", cover: "" }, episodes: {} };
    }
    case "get_short_epg":
    case "get_simple_data_table": {
      const id = Number(params.stream_id);
      return reviewShortEpg(id);
    }
    default:
      return [];
  }
}
