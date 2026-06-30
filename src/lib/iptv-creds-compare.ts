import { normalizeServer } from "@/lib/utils";
import type { XtreamCredentials } from "@/lib/xtream-types";

export function iptvCredentialsFingerprint(
  creds: XtreamCredentials
): string {
  return [
    normalizeServer(creds.server),
    creds.username.trim().toLowerCase(),
    creds.password,
  ].join("\0");
}

/** True when both creds exist and differ (server vs stale cookie/local). */
export function iptvCredentialsDiffer(
  a: XtreamCredentials | null | undefined,
  b: XtreamCredentials | null | undefined
): boolean {
  if (!a || !b) return false;
  return iptvCredentialsFingerprint(a) !== iptvCredentialsFingerprint(b);
}
