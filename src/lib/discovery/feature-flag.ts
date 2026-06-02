/**
 * Discovery shelves (Phase 0+). Set `NEXT_PUBLIC_DISCOVERY_SHELVES=0` to disable.
 * Defaults to enabled so new installs get honest shelves without extra env.
 */
export function isDiscoveryShelvesEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_DISCOVERY_SHELVES?.trim();
  if (v === "0" || v === "false") return false;
  return true;
}
