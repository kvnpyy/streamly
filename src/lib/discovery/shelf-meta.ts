import type { DiscoveryShelfMeta } from "@/lib/discovery/types";
import { regionalTrendingShelfTitle } from "@/lib/discovery/discovery-region";

export const DISCOVERY_SHELF_META: Record<string, DiscoveryShelfMeta> = {
  vod_top_rated_movies: {
    id: "vod_top_rated_movies",
    title: "Top rated",
    eyebrow: "From your playlist",
    signal: "Sorted by provider rating metadata",
    kind: "movie",
    seeAllHref: "/app/movies",
  },
  vod_new_movies: {
    id: "vod_new_movies",
    title: "Newly added",
    eyebrow: "Fresh from your provider",
    signal: "Sorted by when the title was added to your catalog",
    kind: "movie",
    seeAllHref: "/app/movies",
  },
  vod_trending_movies: {
    id: "vod_trending_movies",
    title: "Trending this week",
    eyebrow: "TMDB search interest",
    signal: "Matched from TMDB weekly trending to titles in your playlist",
    kind: "movie",
    seeAllHref: "/app/movies",
  },
  vod_for_you_movies: {
    id: "vod_for_you_movies",
    title: "For you",
    eyebrow: "Your watch history",
    signal: "Based on your recents and favorites on this device",
    kind: "movie",
    seeAllHref: "/app/movies",
  },
  vod_top_rated_series: {
    id: "vod_top_rated_series",
    title: "Top rated",
    eyebrow: "From your playlist",
    signal: "Sorted by provider rating metadata",
    kind: "series",
    seeAllHref: "/app/series",
  },
  vod_new_series: {
    id: "vod_new_series",
    title: "New & updated",
    eyebrow: "Recently changed in your catalog",
    signal: "Sorted by last catalog update from your provider",
    kind: "series",
    seeAllHref: "/app/series",
  },
  vod_trending_series: {
    id: "vod_trending_series",
    title: "Trending this week",
    eyebrow: "TMDB search interest",
    signal: "Matched from TMDB weekly trending to titles in your playlist",
    kind: "series",
    seeAllHref: "/app/series",
  },
  vod_for_you_series: {
    id: "vod_for_you_series",
    title: "For you",
    eyebrow: "Your watch history",
    signal: "Based on your recents and favorites on this device",
    kind: "series",
    seeAllHref: "/app/series",
  },
  live_featured: {
    id: "live_featured",
    title: "Featured channels",
    eyebrow: "Quick picks",
    signal:
      "Favorites and major networks from your playlist — not your Continue watching row",
    kind: "live",
    seeAllHref: "/app/live",
  },
  live_on_now: {
    id: "live_on_now",
    title: "On now",
    eyebrow: "From your programme guide",
    signal: "Channels with a current EPG listing, ranked by network and interest keywords",
    kind: "live",
    seeAllHref: "/app/live",
  },
  live_tonight: {
    id: "live_tonight",
    title: "Tonight's picks",
    eyebrow: "Prime time on your guide",
    signal: "Programmes airing 6:00–11:30 PM local time on your playlist",
    kind: "live",
    seeAllHref: "/app/live",
  },
  live_sports_events: {
    id: "live_sports_events",
    title: "Fight night & events",
    eyebrow: "MMA schedule",
    signal:
      "UFC and MMA events from BALLDONTLIE, matched to channels on your programme guide when possible",
    kind: "live",
    seeAllHref: "/app/live",
  },
  live_sports_on_guide: {
    id: "live_sports_on_guide",
    title: "Sports on your guide",
    eyebrow: "Live TV",
    signal:
      "Sports programmes detected in your EPG listings — not a league schedule feed",
    kind: "live",
    seeAllHref: "/app/live",
  },
};

/** Phase 4 — cross-type regional shelf (title varies by region code). */
export function regionalTrendingShelfMeta(region: string): DiscoveryShelfMeta {
  return {
    id: "home_regional_trending",
    title: regionalTrendingShelfTitle(region),
    eyebrow: "Movies, series & live",
    signal:
      "TMDB weekly search interest, MMA schedule, and programmes on your guide — not viewership counts",
    kind: "live",
    seeAllHref: "/app/search",
  };
}
