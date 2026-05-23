/**
 * Google Analytics 4 — set `NEXT_PUBLIC_GA_MEASUREMENT_ID` in your .env to enable.
 * Leave unset or set to empty string to disable (default for self-hosted installs).
 */
export function gaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!raw || raw === "") return null;
  return raw.trim() || null;
}
