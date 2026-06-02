import {
  notifyTmdbArtworkCache,
  tmdbArtworkCache,
} from "@/lib/tmdb-artwork-cache";

const BATCH_MAX = 24;

/**
 * Warm the artwork cache for programme titles (discovery / live shelves).
 */
export async function prefetchArtworkTitles(
  titles: Iterable<string>
): Promise<void> {
  if (typeof window === "undefined") return;

  const pending: string[] = [];
  const seen = new Set<string>();
  for (const raw of titles) {
    const t = raw.trim();
    if (!t || seen.has(t) || tmdbArtworkCache.has(t)) continue;
    seen.add(t);
    pending.push(t);
    if (pending.length >= BATCH_MAX) break;
  }
  if (pending.length === 0) return;

  try {
    const res = await fetch("/api/artwork/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles: pending }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      images?: Record<string, string | null>;
    };
    const images = data.images ?? {};
    for (const title of pending) {
      const url = images[title] ?? null;
      tmdbArtworkCache.set(title, url);
    }
    notifyTmdbArtworkCache();
  } catch {
    for (const title of pending) {
      if (!tmdbArtworkCache.has(title)) tmdbArtworkCache.set(title, null);
    }
    notifyTmdbArtworkCache();
  }
}
