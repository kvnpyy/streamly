/**
 * Google Analytics 4 — set `NEXT_PUBLIC_GA_MEASUREMENT_ID` in your .env to override.
 * Set to empty string to disable (e.g. self-hosted installs).
 */
const DEFAULT_GA_MEASUREMENT_ID = "G-29BPRZW3R6";

export function gaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (raw === "") return null;
  if (raw?.trim()) return raw.trim();
  return DEFAULT_GA_MEASUREMENT_ID;
}
