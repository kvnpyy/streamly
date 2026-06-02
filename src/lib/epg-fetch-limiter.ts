import { isLivingRoomPlaybackClient } from "@/lib/tv-playback-tune";

/** Max in-flight EPG proxy calls — avoids 502 storms on TV and weak panels. */
export function maxConcurrentEpgFetches(): number {
  if (typeof window === "undefined") return 6;
  return isLivingRoomPlaybackClient() ? 2 : 5;
}

let active = 0;
const waiters: Array<() => void> = [];

function drainQueue() {
  while (active < maxConcurrentEpgFetches() && waiters.length > 0) {
    active++;
    const start = waiters.shift()!;
    start();
  }
}

/**
 * Run one EPG-related `/api/xtream` fetch through a global concurrency pool so
 * discovery, browse shelves, and category views do not open dozens of parallel
 * upstream requests.
 */
export function runEpgFetch<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      void fn()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          drainQueue();
        });
    };
    waiters.push(start);
    drainQueue();
  });
}
