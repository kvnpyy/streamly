/** Strip provider prefixes and punctuation for fuzzy title matching. */
export function normalizeDiscoveryTitle(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^\[?(us|uk|ca|au|ie|nz|4k|hd|fhd|uhd)\]?\s*[:|-]?\s*/gi, "");
  s = s.replace(/\b(4k|uhd|fhd|hd|sd)\b/gi, "");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function extractYear(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const m = value.match(/\b(19|20)\d{2}\b/);
  return m?.[0];
}
