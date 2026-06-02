export type SportEventTier = "main" | "card" | "other";

export type CachedSportEvent = {
  id: string;
  title: string;
  shortTitle?: string;
  /** YYYY-MM-DD (event calendar date from API). */
  date: string;
  /** ISO timestamp when the main card is scheduled to start, if known. */
  startsAt?: string;
  tier: SportEventTier;
  league?: string;
  venue?: string;
  status?: string;
  /** Lowercase tokens for fuzzy EPG / channel matching. */
  keywords: string[];
};

export type SportsEventsCachePayload = {
  events: CachedSportEvent[];
};

export type DiscoverySportsApiResponse = {
  enabled: boolean;
  region: string;
  syncedAt: string | null;
  events: CachedSportEvent[];
};
