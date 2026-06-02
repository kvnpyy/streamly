/** Xtream actions that hit per-channel EPG — rate-limit and degrade gracefully. */
export const XTREAM_EPG_ACTIONS = new Set([
  "get_short_epg",
  "get_simple_data_table",
]);

export function isXtreamEpgAction(action: string | null | undefined): boolean {
  return action != null && XTREAM_EPG_ACTIONS.has(action);
}

/** Empty payload accepted by {@link extractXtreamEpgPayload}. */
export const EMPTY_XTREAM_EPG = { epg_listings: [] };
