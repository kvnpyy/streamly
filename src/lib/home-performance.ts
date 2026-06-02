/** Home page performance — heavy catalog/discovery is opt-in or deferred. */

function envEnabled(name: string): boolean {
  const v = process.env[name]?.trim();
  return v === "1" || v === "true";
}

/** When true, home auto-loads movie/series shelves after idle (can freeze large catalogs). */
export function isHomeAutoRichEnabled(): boolean {
  return envEnabled("NEXT_PUBLIC_HOME_AUTO_RICH");
}

/** Milliseconds of idle before auto-rich (if enabled). */
export const HOME_AUTO_RICH_DELAY_MS = 12_000;
