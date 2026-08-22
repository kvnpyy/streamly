import { usePrefs } from "@/store/preferences";

/** Zustand persist API is missing if the store module failed to attach middleware. */
export function prefsHasHydrated(): boolean {
  try {
    return usePrefs.persist?.hasHydrated() === true;
  } catch {
    return false;
  }
}

export function onPrefsFinishHydration(onStoreChange: () => void): () => void {
  try {
    const persist = usePrefs.persist;
    if (typeof persist?.onFinishHydration === "function") {
      return persist.onFinishHydration(onStoreChange);
    }
  } catch {
    /* Private mode / blocked storage */
  }
  return () => {};
}

export function rehydratePrefs(): void {
  try {
    void usePrefs.persist?.rehydrate();
  } catch {
    /* ignore */
  }
}
