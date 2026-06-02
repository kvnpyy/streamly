import { parseGenreList } from "@/lib/parse-genres";
import Link from "next/link";

export function GenreChips({
  genre,
  className = "",
}: {
  genre: string | undefined | null;
  className?: string;
}) {
  const items = parseGenreList(genre);
  if (items.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((g) => (
        <Link
          key={g}
          href={`/app/search?q=${encodeURIComponent(g)}`}
          className="chip hover:bg-white/10 hover:text-(--text) transition-colors"
        >
          {g}
        </Link>
      ))}
    </div>
  );
}
