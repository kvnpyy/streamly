/** Split Xtream `genre` strings ("Action, Drama" / "Action | Sci-Fi") into display chips. */
export function parseGenreList(raw: string | undefined | null): string[] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  const parts = s
    .split(/[,/|;]+/)
    .map((g) => g.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
