import {
  detectRegionFromTimezone,
  type TvRegion,
} from "@/lib/geo-continent";

/**
 * ISO 3166-1 country code for TMDB trending (`region` query param).
 * Must align with the user's TV browse region, not server default env.
 */
export function tvRegionToTmdbCountry(tvRegion: TvRegion | null | undefined): string {
  switch (tvRegion) {
    case "North America":
      return "US";
    case "Latin America":
      return "MX";
    case "Europe":
      return "GB";
    case "Asia":
      return "IN";
    case "Middle East":
      return "AE";
    case "Africa":
      return "ZA";
    case "Oceania":
      return "AU";
    case "All":
    default: {
      const tz = detectRegionFromTimezone();
      if (tz === "All") return "US";
      return tvRegionToTmdbCountry(tz);
    }
  }
}

/** Server/build default when no client context (env override only). */
export function getDiscoveryRegion(): string {
  const fromPublic = process.env.NEXT_PUBLIC_DISCOVERY_REGION?.trim();
  if (fromPublic) return fromPublic.toUpperCase();
  return "US";
}

/**
 * Resolve TMDB country for discovery APIs.
 * Prefer explicit TV browse region; fall back to timezone; then env default.
 */
export function resolveTmdbCountry(opts?: {
  tvRegion?: TvRegion | null;
}): string {
  if (opts?.tvRegion && opts.tvRegion !== "All") {
    return tvRegionToTmdbCountry(opts.tvRegion);
  }
  const tz = detectRegionFromTimezone();
  if (tz !== "All") {
    return tvRegionToTmdbCountry(tz);
  }
  return getDiscoveryRegion();
}
