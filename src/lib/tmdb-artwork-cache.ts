/** Shared TMDB artwork URL cache (browser + batch prefetch). */
export const tmdbArtworkCache = new Map<string, string | null>();

const listeners = new Set<() => void>();

export function subscribeTmdbArtworkCache(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function notifyTmdbArtworkCache(): void {
  for (const cb of listeners) cb();
}
