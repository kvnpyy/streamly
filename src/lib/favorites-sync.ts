import type { Favorite, FavoriteKind } from "@/store/preferences";

export const FAVORITES_MAX = 500;
export const PROVIDER_ACCOUNT_KEY_MAX = 512;

const KINDS = new Set<FavoriteKind>(["live", "movie", "series"]);

export function favoriteKey(f: Pick<Favorite, "kind" | "id">): string {
  return `${f.kind}:${f.id}`;
}

/** Union local + remote by kind/id; newer `addedAt` wins metadata. */
export function mergeFavorites(local: Favorite[], remote: Favorite[]): Favorite[] {
  const map = new Map<string, Favorite>();
  for (const f of [...remote, ...local]) {
    const k = favoriteKey(f);
    const existing = map.get(k);
    if (!existing || f.addedAt >= existing.addedAt) {
      map.set(k, f);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, FAVORITES_MAX);
}

export function isValidProviderAccountKey(key: string): boolean {
  if (typeof key !== "string") return false;
  const trimmed = key.trim();
  if (!trimmed || trimmed.length > PROVIDER_ACCOUNT_KEY_MAX) return false;
  return trimmed.includes("|");
}

function sanitizeMeta(
  meta: unknown
): Record<string, string | number | undefined> | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const out: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length > 64) continue;
    if (typeof v === "string") out[k] = v.slice(0, 512);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (v === undefined) out[k] = undefined;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Parse and cap favorites from API / DB JSON. */
export function sanitizeFavorites(raw: unknown): Favorite[] {
  if (!Array.isArray(raw)) return [];
  const out: Favorite[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kind = o.kind;
    const id = o.id;
    const name = o.name;
    const addedAt = o.addedAt;
    if (typeof kind !== "string" || !KINDS.has(kind as FavoriteKind)) continue;
    if (typeof id !== "number" || !Number.isFinite(id) || id <= 0) continue;
    if (typeof name !== "string" || !name.trim()) continue;
    const icon = typeof o.icon === "string" ? o.icon.slice(0, 2048) : undefined;
    const meta = sanitizeMeta(o.meta);
    out.push({
      kind: kind as FavoriteKind,
      id,
      name: name.trim().slice(0, 512),
      icon,
      meta,
      addedAt:
        typeof addedAt === "number" && Number.isFinite(addedAt)
          ? addedAt
          : Date.now(),
    });
    if (out.length >= FAVORITES_MAX) break;
  }
  return out;
}
