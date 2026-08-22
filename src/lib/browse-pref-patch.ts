import type { BrowsePrefs } from "@/store/preferences";

/** True when applying `patch` would not change any field on `prev`. */
export function browsePrefPatchIsNoop(
  prev: BrowsePrefs | undefined,
  patch: Partial<BrowsePrefs>
): boolean {
  if (!prev) return false;
  for (const key of Object.keys(patch) as Array<keyof BrowsePrefs>) {
    if (!Object.is(prev[key], patch[key])) return false;
  }
  return true;
}
