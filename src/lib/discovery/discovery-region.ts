const REGION_DISPLAY: Record<string, string> = {
  US: "the US",
  UK: "the UK",
  CA: "Canada",
  AU: "Australia",
  IE: "Ireland",
  NZ: "New Zealand",
};

export {
  getDiscoveryRegion,
  resolveTmdbCountry,
  tvRegionToTmdbCountry,
} from "@/lib/discovery/tmdb-region";

export function discoveryRegionDisplayName(region: string): string {
  const code = region.trim().toUpperCase();
  return REGION_DISPLAY[code] ?? code;
}

export function regionalTrendingShelfTitle(region: string): string {
  const name = discoveryRegionDisplayName(region);
  if (name.startsWith("the ")) {
    return `Trending in ${name}`;
  }
  return `Trending in ${name}`;
}
