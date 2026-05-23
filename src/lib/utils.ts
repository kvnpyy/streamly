import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDate(unix: number | string | undefined): string {
  if (!unix) return "";
  const n = typeof unix === "string" ? parseInt(unix, 10) : unix;
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n * 1000);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function debounce<F extends (...args: never[]) => unknown>(fn: F, wait = 200) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<F>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function safeStr(x: unknown): string {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

export function safeLower(x: unknown): string {
  return safeStr(x).toLowerCase();
}

export function safeNumber(x: unknown, fallback = 0): number {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = parseFloat(x);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Parses `[id]` dynamic segments from Next.js `useParams()`.
 * Some Xtream JSON mixes numeric IDs as strings; URLs must stay stable on iOS Safari.
 */
export function parsePositiveRouteId(raw: unknown): number | null {
  if (raw == null) return null;
  const segment = Array.isArray(raw) ? raw[0] : raw;
  const str = safeStr(segment).trim();
  if (!str) return null;
  const match = str.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Xtream `container_extension` (strip leading dot, lower case). */
export function normalizeContainerExt(ext: string | undefined | null): string {
  const e = safeStr(ext).toLowerCase().replace(/^\./, "").trim();
  return e || "unknown";
}

/**
 * For UI hints: many panels serve MKV/TS/… with codecs web players often
 * cannot decode. MP4 is the most likely to work in a browser—not a guarantee.
 */
export type VodContainerUiHint = "mp4" | "risky" | "other";

const RISKY_VOD_CONTAINER_EXTS = new Set([
  "mkv",
  "avi",
  "ts",
  "m2ts",
  "wmv",
  "flv",
  "mpg",
  "mpeg",
  "divx",
]);

export function vodContainerUiHint(ext: string | undefined | null): VodContainerUiHint {
  const e = normalizeContainerExt(ext);
  if (e === "mp4" || e === "m4v") return "mp4";
  if (RISKY_VOD_CONTAINER_EXTS.has(e)) return "risky";
  return "other";
}

const ADULT_KEYWORDS = [
  "xxx",
  "porn",
  "adult",
  "erotic",
  "hot tv",
  "sex",
  "playboy",
  "vivid",
  "brazzers",
  "private",
  "18+",
  "+18",
  "hustler",
  "blue",
  "x-rated",
];

export function looksAdult(input: {
  is_adult?: number | string;
  category_name?: string;
  name?: string;
}): boolean {
  const isAdultFlag = input.is_adult === 1 || input.is_adult === "1";
  if (isAdultFlag) return true;
  const haystack = [input.category_name, input.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!haystack) return false;
  return ADULT_KEYWORDS.some((k) => haystack.includes(k));
}

export function normalizeServer(url: string): string {
  let u = url.trim();
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = "http://" + u;
  return u.replace(/\/+$/, "");
}
