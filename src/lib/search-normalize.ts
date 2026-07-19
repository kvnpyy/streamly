import { safeLower } from "@/lib/utils";

/** Shared min length for catalog / global / live name search. */
export const MIN_SEARCH_QUERY_LEN = 2;

/**
 * Normalize a user query or title for substring matching:
 * lowercase, collapse whitespace, strip most punctuation to spaces.
 */
export function normalizeSearchText(raw: unknown): string {
  return safeLower(raw)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when haystack contains needle after both are normalized. */
export function textMatchesSearch(
  haystack: unknown,
  needleNormalized: string
): boolean {
  if (!needleNormalized) return false;
  return normalizeSearchText(haystack).includes(needleNormalized);
}
