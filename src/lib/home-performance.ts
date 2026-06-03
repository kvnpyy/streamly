/** Home page performance — heavy catalog/discovery is opt-in or deferred. */

function envEnabled(name: string): boolean {
  const v = process.env[name]?.trim();
  return v === "1" || v === "true";
}

/** When false, home never auto-loads movie/series recommendation shelves. */
export function isHomeAutoRichDisabled(): boolean {
  const v = process.env.NEXT_PUBLIC_HOME_AUTO_RICH?.trim();
  return v === "0" || v === "false";
}

/** Idle delay before auto-loading home recommendations (default on). */
export const HOME_AUTO_RICH_DELAY_MS = 2_500;
