import {
  buildEpgPopularOnTvFallback,
  buildLiveTrendingOnTv,
  LIVE_TRENDING_MIN_ITEMS,
} from "@/lib/discovery/live-trending-on-tv";
import {
  isChannelOnlyListing,
  shouldShowTrendingOnTvShelf,
} from "@/lib/discovery/live-trending-quality";
import type { StreamEpgSnapshot } from "@/lib/discovery/live-epg";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import type { TmdbTrendingItem } from "@/lib/discovery/types";
import type { LiveStream } from "@/lib/xtream-types";

export type TrendingDiagnoseInput = {
  candidateIds: number[];
  channelById: Map<number, LiveStream>;
  snapshots: Map<number, StreamEpgSnapshot>;
  tmdbTrending?: TmdbTrendingItem[];
  recentIds?: Set<number> | number[];
  favIds?: Set<number> | number[];
};

export type TrendingDiagnoseReport = {
  candidateCount: number;
  snapshotCount: number;
  snapshotsWithTitle: number;
  tmdbCount: number;
  builtCount: number;
  builtQualityPass: boolean;
  fallbackCount: number;
  fallbackQualityPass: boolean;
  finalCount: number;
  finalQualityPass: boolean;
  channelOnlyRejected: number;
  sampleSnapshots: Array<{
    streamId: number;
    channel: string;
    title: string;
    channelOnly: boolean;
  }>;
  sampleFinal: Array<{ channel: string; programme: string }>;
};

function allIdsWithSnapshots(
  candidateIds: number[],
  snapshots: Map<number, StreamEpgSnapshot>
): number[] {
  const ids = new Set(candidateIds);
  for (const id of snapshots.keys()) ids.add(id);
  return [...ids];
}

/** Pure pipeline mirror used in tests and debug tooling. */
export function diagnoseTrendingOnTvPipeline(
  input: TrendingDiagnoseInput
): TrendingDiagnoseReport {
  const recentIds =
    input.recentIds instanceof Set
      ? input.recentIds
      : new Set(input.recentIds ?? []);
  const favIds =
    input.favIds instanceof Set ? input.favIds : new Set(input.favIds ?? []);
  const tmdb = input.tmdbTrending ?? [];

  const snapshotsWithTitle = [...input.snapshots.entries()].filter(([, s]) =>
    s.nowTitle?.trim()
  );

  let channelOnlyRejected = 0;
  const sampleSnapshots = snapshotsWithTitle.slice(0, 12).map(([streamId, s]) => {
    const channel = input.channelById.get(streamId)?.name ?? `#${streamId}`;
    const title = s.nowTitle!.trim();
    const channelOnly = isChannelOnlyListing(title, channel);
    if (channelOnly) channelOnlyRejected += 1;
    return { streamId, channel, title, channelOnly };
  });

  const built = buildLiveTrendingOnTv(
    input.candidateIds,
    input.channelById,
    input.snapshots,
    tmdb,
    recentIds,
    favIds
  );
  const builtQualityPass = shouldShowTrendingOnTvShelf(built);

  const fallbackIds = allIdsWithSnapshots(input.candidateIds, input.snapshots);
  const fallback = buildEpgPopularOnTvFallback(
    fallbackIds,
    input.channelById,
    input.snapshots,
    recentIds,
    favIds
  );
  const fallbackQualityPass = shouldShowTrendingOnTvShelf(fallback);

  let final: ScoredLiveEntry[] = builtQualityPass ? built : [];
  if (final.length === 0 && fallbackQualityPass) {
    final = fallback;
  }
  const finalQualityPass = shouldShowTrendingOnTvShelf(final);

  return {
    candidateCount: input.candidateIds.length,
    snapshotCount: input.snapshots.size,
    snapshotsWithTitle: snapshotsWithTitle.length,
    tmdbCount: tmdb.length,
    builtCount: built.length,
    builtQualityPass,
    fallbackCount: fallback.length,
    fallbackQualityPass,
    finalCount: final.length,
    finalQualityPass,
    channelOnlyRejected,
    sampleSnapshots,
    sampleFinal: final.slice(0, 8).map((e) => ({
      channel: e.stream.name,
      programme: e.programmeTitle,
    })),
  };
}

export function formatTrendingDiagnoseReport(r: TrendingDiagnoseReport): string {
  const lines = [
    `candidates=${r.candidateCount} snapshots=${r.snapshotCount} withTitle=${r.snapshotsWithTitle}`,
    `tmdb=${r.tmdbCount} built=${r.builtCount} (pass=${r.builtQualityPass}) fallback=${r.fallbackCount} (pass=${r.fallbackQualityPass})`,
    `final=${r.finalCount} (pass=${r.finalQualityPass}, min=${LIVE_TRENDING_MIN_ITEMS})`,
    `channelOnlyRejectedInSample=${r.channelOnlyRejected}`,
  ];
  if (r.sampleSnapshots.length) {
    lines.push("sample snapshots:");
    for (const s of r.sampleSnapshots) {
      lines.push(
        `  - ${s.channel} => "${s.title}"${s.channelOnly ? " [channel-only]" : ""}`
      );
    }
  }
  if (r.sampleFinal.length) {
    lines.push("final shelf:");
    for (const s of r.sampleFinal) {
      lines.push(`  - ${s.channel} => "${s.programme}"`);
    }
  }
  return lines.join("\n");
}
