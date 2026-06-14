"use client";

import { useEffect, useRef } from "react";

type Props = {
  loaded: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  label?: string;
};

export function CatalogGridLoadMore({
  loaded,
  total,
  hasMore,
  loading,
  onLoadMore,
  label = "titles",
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "480px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        className="min-h-11 px-5 rounded-xl text-sm font-semibold border border-(--line) bg-(--bg-2) text-(--text) hover:border-(--brand)/45 hover:bg-(--bg-3) disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50"
      >
        {loading
          ? "Loading…"
          : `Show more (${loaded.toLocaleString()} of ${total.toLocaleString()} ${label})`}
      </button>
      <div ref={sentinelRef} className="h-px w-full max-w-xs" aria-hidden />
    </div>
  );
}
