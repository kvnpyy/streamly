const TV_ROUTE_LABELS: Record<string, string> = {
  "/app": "Home",
  "/app/live": "Live TV",
  "/app/movies": "Movies",
  "/app/series": "TV Series",
  "/app/settings": "Settings",
  "/app/favorites": "My List",
  "/app/search": "Search",
  "/app/continue": "Continue watching",
};

export function tvRouteLabel(pathname: string): string {
  if (TV_ROUTE_LABELS[pathname]) return TV_ROUTE_LABELS[pathname]!;
  if (pathname.startsWith("/app/movies/")) return "Movie";
  if (pathname.startsWith("/app/series/")) return "Series";
  if (pathname.startsWith("/app/live")) return "Live TV";
  return "Streamly";
}
