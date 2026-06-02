import { SHORT_EPG_STALE_MS } from "@/lib/hooks";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { xtream } from "@/lib/xtream";

export function shortEpgQueryKey(
  creds: XtreamCredentials,
  streamId: number,
  limit: number
) {
  return ["short-epg", creds.server, creds.username, streamId, limit] as const;
}

export function shortEpgQueryOptions(
  creds: XtreamCredentials,
  streamId: number,
  limit: number
) {
  return {
    queryKey: shortEpgQueryKey(creds, streamId, limit),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      xtream.shortEPG(creds, streamId, limit, signal),
    staleTime: SHORT_EPG_STALE_MS,
    structuralSharing: false,
    retry: false as const,
  };
}
